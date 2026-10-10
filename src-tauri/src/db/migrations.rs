//! Schema migrations.
//!
//! The schema version lives in `PRAGMA user_version`. Version 0 is either an
//! empty database or one written by a pre-v2 build of the app (a flat `songs`
//! table holding artist, genre and album as text), which `migrate_legacy`
//! converts. Each migration runs in a single transaction.

use std::collections::HashMap;
use rusqlite::{params, Connection, Transaction};
use super::catalog::{find_or_create_song, name_key, NewSong};
use super::mastery::status_rank;
use super::{query_all, Result};

pub const SCHEMA_VERSION: i32 = 1;

const SCHEMA_V1: &str = include_str!("schema_v1.sql");

/// The pre-v2 tables, as the last pre-v2 build created them. Used so that a
/// database from an even older build has every table and column to copy from.
const LEGACY_TABLES: &str = include_str!("legacy_schema.sql");

/// Copies sessions, MIDI, achievements, goals and settings out of the renamed
/// legacy tables (using `temp.song_id_map`), then drops them.
const LEGACY_COPY: &str = include_str!("legacy_copy.sql");

const LEGACY_COLUMNS: &[(&str, &str, &str)] = &[
    ("sessions", "song_id", "INTEGER"),
    ("sessions", "song_name", "TEXT"),
    ("sessions", "feeling", "INTEGER"),
    ("sessions", "practice_type", "TEXT"),
    ("songs", "status", "TEXT DEFAULT 'learning'"),
    ("songs", "difficulty", "INTEGER"),
];

/// Bring the database to `SCHEMA_VERSION` and turn on foreign key enforcement.
pub fn migrate(conn: &mut Connection) -> Result<()> {
    // Foreign keys must be off while tables are rebuilt; the pragma is a no-op
    // inside a transaction, so it is toggled around the migration.
    conn.execute_batch("PRAGMA foreign_keys = OFF;")?;
    let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;

    if version < 1 {
        let legacy = table_exists(conn, "sessions")?;
        if legacy {
            backup(conn, "before-v2")?;
        }
        let tx = conn.transaction()?;
        if legacy {
            migrate_legacy(&tx)?;
        } else {
            tx.execute_batch(SCHEMA_V1)?;
        }
        check_foreign_keys(&tx)?;
        tx.execute_batch(&format!("PRAGMA user_version = {SCHEMA_VERSION};"))?;
        tx.commit()?;
    }

    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(())
}

fn table_exists(conn: &Connection, name: &str) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        params![name],
        |r| r.get(0),
    )
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2)",
        params![table, column],
        |r| r.get(0),
    )
}

/// Copy the database file next to itself before a destructive migration.
/// An existing backup is kept, so a retried migration never overwrites the
/// original data.
fn backup(conn: &Connection, label: &str) -> Result<()> {
    if let Some(path) = conn.path().filter(|p| !p.is_empty()) {
        let backup = format!("{path}.{label}.bak");
        if !std::path::Path::new(&backup).exists() {
            conn.execute("VACUUM INTO ?1", params![backup])?;
        }
    }
    Ok(())
}

fn check_foreign_keys(tx: &Transaction) -> Result<()> {
    let violations: i64 = tx.query_row(
        "SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0),
    )?;
    if violations > 0 {
        return Err(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CONSTRAINT_FOREIGNKEY),
            Some(format!("migration left {violations} foreign key violation(s)")),
        ));
    }
    Ok(())
}

/// Older builds stored some timestamps in seconds; everything is ms now.
fn to_ms(ts: i64) -> i64 {
    if ts < 100_000_000_000 { ts * 1000 } else { ts }
}

/// Convert a pre-v2 database: rename the old tables out of the way, create the
/// v1 schema, copy the data across and drop the old tables. Song and session
/// ids are kept. Songs sharing a normalized title and artist are merged.
fn migrate_legacy(tx: &Transaction) -> Result<()> {
    tx.execute_batch(LEGACY_TABLES)?;
    for (table, column, decl) in LEGACY_COLUMNS {
        if !column_exists(tx, table, column)? {
            tx.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {decl}"))?;
        }
    }
    for table in ["sessions", "songs", "midi_events", "goals", "achievements", "settings"] {
        tx.execute_batch(&format!("ALTER TABLE {table} RENAME TO legacy_{table}"))?;
    }
    tx.execute_batch(SCHEMA_V1)?;

    let song_ids = copy_songs(tx)?;
    tx.execute_batch("CREATE TEMP TABLE song_id_map (old_id INTEGER PRIMARY KEY, new_id INTEGER NOT NULL)")?;
    {
        let mut stmt = tx.prepare("INSERT INTO temp.song_id_map (old_id, new_id) VALUES (?1, ?2)")?;
        for (old, new) in &song_ids {
            stmt.execute(params![old, new])?;
        }
    }
    tx.execute_batch(LEGACY_COPY)
}

struct LegacySong {
    id: i64,
    title: String,
    artist: Option<String>,
    genre: Option<String>,
    album: Option<String>,
    year: Option<i32>,
    cover_url: Option<String>,
    recording_id: Option<String>,
    created_at: i64,
    status: Option<String>,
    difficulty: Option<i32>,
}

/// Copy the legacy songs into the catalog. Returns old song id → new song id;
/// duplicates map to the song they were merged into.
fn copy_songs(tx: &Transaction) -> Result<HashMap<i64, i64>> {
    let songs: Vec<LegacySong> = query_all(
        tx,
        "SELECT id, title, artist, genre, album, year, cover_url,
                musicbrainz_recording_id, created_at, status, difficulty
         FROM legacy_songs ORDER BY id",
        [],
        |r| Ok(LegacySong {
            id: r.get(0)?,
            title: r.get(1)?,
            artist: r.get(2)?,
            genre: r.get(3)?,
            album: r.get(4)?,
            year: r.get(5)?,
            cover_url: r.get(6)?,
            recording_id: r.get(7)?,
            created_at: r.get(8)?,
            status: r.get(9)?,
            difficulty: r.get(10)?,
        }),
    )?;

    let mut song_ids = HashMap::new();
    for s in songs.iter().filter(|s| !name_key(&s.title).is_empty()) {
        let created_at = to_ms(s.created_at);
        let id = find_or_create_song(tx, &NewSong {
            title: &s.title,
            artist: s.artist.as_deref(),
            genre: s.genre.as_deref(),
            album: s.album.as_deref(),
            year: s.year,
            cover_url: s.cover_url.as_deref(),
            itunes_track_id: None,
            difficulty: s.difficulty.filter(|d| (1..=5).contains(d)),
        }, created_at, Some(s.id))?;

        if let Some(ext) = s.recording_id.as_deref().map(str::trim).filter(|e| !e.is_empty()) {
            // The column kept its MusicBrainz name after the switch to iTunes.
            let provider = if ext.chars().all(|c| c.is_ascii_digit()) { "itunes" } else { "musicbrainz" };
            tx.execute(
                "INSERT OR IGNORE INTO song_external_ids (song_id, provider, external_id) VALUES (?1, ?2, ?3)",
                params![id, provider, ext],
            )?;
        }

        // A merged duplicate keeps the most advanced status and the earliest date.
        let current: String = tx.query_row("SELECT status FROM songs WHERE id = ?1", params![id], |r| r.get(0))?;
        let status = s.status.as_deref()
            .filter(|st| status_rank(st) > status_rank(&current))
            .unwrap_or(&current);
        tx.execute(
            "UPDATE songs SET status = ?2, created_at = MIN(created_at, ?3), updated_at = MIN(updated_at, ?3)
             WHERE id = ?1",
            params![id, status, created_at],
        )?;
        song_ids.insert(s.id, id);
    }
    Ok(song_ids)
}

#[cfg(test)]
#[allow(clippy::type_complexity)]
mod tests {
    use super::*;

    #[test]
    fn fresh_database_gets_current_schema() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, SCHEMA_VERSION);
        let fk: bool = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
        assert!(fk);
        // Running again is a no-op.
        migrate(&mut conn).unwrap();
    }

    #[test]
    fn legacy_database_is_converted() {
        let mut conn = Connection::open_in_memory().unwrap();
        // Foreign keys off so the fixture can hold dangling references to clean up.
        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        conn.execute_batch(LEGACY_TABLES).unwrap();
        conn.execute_batch("
            ALTER TABLE sessions ADD COLUMN song_id INTEGER REFERENCES songs(id);
            ALTER TABLE sessions ADD COLUMN song_name TEXT;
            ALTER TABLE sessions ADD COLUMN feeling INTEGER;
            ALTER TABLE sessions ADD COLUMN practice_type TEXT;
            ALTER TABLE songs ADD COLUMN status TEXT DEFAULT 'learning';
            ALTER TABLE songs ADD COLUMN difficulty INTEGER;
            INSERT INTO goals (goal_type, target_minutes) VALUES ('daily', 45);
            INSERT INTO settings (key, value) VALUES ('reminder_hour', '19');
            INSERT INTO achievements (key, unlocked_at) VALUES ('first_session', 1700000000);
            INSERT INTO songs (id, title, artist, genre, album, year, cover_url, spotify_url,
                               musicbrainz_recording_id, created_at, status, difficulty) VALUES
                (1, 'Nuvole Bianche', 'Ludovico Einaudi', 'Classical', 'Una Mattina', 2004,
                 'a.jpg', 'spotify:search:x', '1440649960', 1700000000, 'learning', NULL),
                (2, ' nuvole bianche', 'ludovico einaudi ', 'Soundtrack', 'Una Mattina', 2004,
                 NULL, NULL, NULL, 1700000500, 'practicing', 3),
                (3, 'Experience', 'Ludovico Einaudi', 'Classical', 'In a Time Lapse', 2013,
                 'b.jpg', NULL, NULL, 1700001000000, 'bogus', 9),
                (4, 'My own tune', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1700002000000, NULL, NULL);
            INSERT INTO sessions (id, date, start_ts, end_ts, duration_seconds, song_id, song_name,
                                  feeling, practice_type) VALUES
                (10, '2023-11-14', 1000, 61000, 60, 1, 'Nuvole Bianche', 4, 'full'),
                (11, '2023-11-15', 2000, 1000, 0, 2, 'nuvole bianche', 9, 'weird'),
                (12, '2023-11-16', 5000, 65000, 60, NULL, NULL, NULL, NULL),
                (13, '2023-11-17', 5000, 65000, 60, 99, 'deleted song', NULL, NULL);
            INSERT INTO midi_events (id, session_id, relative_ms, note, velocity, channel) VALUES
                (1, 10, 0, 60, 80, 0), (2, 10, 500, 60, 0, 0), (3, 10, 400, 64, 70, 0),
                (4, 77, 0, 60, 80, 0);
        ").unwrap();

        migrate(&mut conn).unwrap();

        // Duplicates merged into the oldest entry, with the best status and filled gaps.
        let songs: Vec<(i64, String, Option<String>, String, Option<i32>)> = query_all(&conn, "SELECT s.id, s.title, a.name, s.status, s.difficulty FROM songs s
             LEFT JOIN artists a ON a.id = s.artist_id ORDER BY s.id", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))).unwrap();
        assert_eq!(songs, vec![
            (1, "Nuvole Bianche".into(), Some("Ludovico Einaudi".into()), "practicing".into(), Some(3)),
            (3, "Experience".into(), Some("Ludovico Einaudi".into()), "learning".into(), None),
            (4, "My own tune".into(), None, "learning".into(), None),
        ]);
        let artists: i64 = conn.query_row("SELECT COUNT(*) FROM artists", [], |r| r.get(0)).unwrap();
        assert_eq!(artists, 1);
        let albums: i64 = conn.query_row("SELECT COUNT(*) FROM albums", [], |r| r.get(0)).unwrap();
        assert_eq!(albums, 2);
        let genres: String = conn.query_row(
            "SELECT GROUP_CONCAT(g.name) FROM song_genres x JOIN genres g ON g.id = x.genre_id WHERE x.song_id = 1",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(genres, "Classical,Soundtrack");
        let ext: (i64, String) = conn.query_row(
            "SELECT song_id, provider FROM song_external_ids WHERE external_id = '1440649960'",
            [], |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert_eq!(ext, (1, "itunes".into()));
        let created: i64 = conn.query_row("SELECT created_at FROM songs WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(created, 1_700_000_000_000);

        // Sessions keep their ids, point at the merged song and lose invalid values.
        let sessions: Vec<(i64, Option<i64>, i64, Option<i64>, Option<String>)> = query_all(&conn, "SELECT id, song_id, duration_seconds, feeling, practice_type FROM sessions ORDER BY id", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))).unwrap();
        assert_eq!(sessions, vec![
            (10, Some(1), 60, Some(4), Some("full".into())),
            (11, Some(1), 0, None, None),
            (12, None, 60, None, None),
            (13, None, 60, None, None),
        ]);

        // MIDI events keep insertion order; orphans are dropped.
        let midi: Vec<(i64, i64, i64)> = query_all(&conn, "SELECT session_id, seq, relative_ms FROM midi_events ORDER BY session_id, seq", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap();
        assert_eq!(midi, vec![(10, 0, 0), (10, 1, 500), (10, 2, 400)]);

        let goal: i64 = conn.query_row("SELECT target_minutes FROM goals", [], |r| r.get(0)).unwrap();
        assert_eq!(goal, 45);
        let unlocked: i64 = conn.query_row("SELECT unlocked_at FROM achievements", [], |r| r.get(0)).unwrap();
        assert_eq!(unlocked, 1_700_000_000_000);
        let setting: String = conn.query_row("SELECT value FROM settings WHERE key = 'reminder_hour'", [], |r| r.get(0)).unwrap();
        assert_eq!(setting, "19");
        let history: i64 = conn.query_row("SELECT COUNT(*) FROM song_status_changes", [], |r| r.get(0)).unwrap();
        assert_eq!(history, 3);
        let legacy_left: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'legacy_%'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(legacy_left, 0);
        let fk: bool = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
        assert!(fk);
    }

    #[test]
    fn failed_migration_leaves_legacy_data_untouched() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(LEGACY_TABLES).unwrap();
        // A table name the v1 schema needs is already taken, so the migration fails.
        conn.execute_batch("CREATE TABLE artists (x INTEGER);
                            INSERT INTO sessions (date, start_ts, end_ts, duration_seconds)
                            VALUES ('2023-11-14', 0, 1000, 1);").unwrap();
        assert!(migrate(&mut conn).is_err());
        let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, 0);
        let kept: i64 = conn.query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0)).unwrap();
        assert_eq!(kept, 1);
        assert!(conn.prepare("SELECT 1 FROM legacy_sessions").is_err());
    }
}
