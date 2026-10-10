//! Database schema and versioned migrations.
//!
//! The schema version lives in `PRAGMA user_version`. Version 0 is either an
//! empty database or one written by a pre-v2 build of the app (a flat `songs`
//! table holding artist, genre and album as text), which `migrate_legacy`
//! converts. Each migration runs in a single transaction.

use std::collections::HashMap;
use rusqlite::{params, Connection, Transaction};
use crate::db::{self, NewSong};

pub const SCHEMA_VERSION: i32 = 1;

const SCHEMA_V1: &str = "
    -- ── Catalog ─────────────────────────────────────────────────────────────
    CREATE TABLE artists (
        id          INTEGER PRIMARY KEY,
        name        TEXT    NOT NULL,
        name_key    TEXT    NOT NULL UNIQUE,
        created_at  INTEGER NOT NULL
    );
    CREATE TABLE genres (
        id        INTEGER PRIMARY KEY,
        name      TEXT NOT NULL,
        name_key  TEXT NOT NULL UNIQUE
    );
    CREATE TABLE albums (
        id         INTEGER PRIMARY KEY,
        title      TEXT    NOT NULL,
        title_key  TEXT    NOT NULL,
        artist_id  INTEGER REFERENCES artists(id) ON DELETE SET NULL,
        year       INTEGER,
        cover_url  TEXT
    );
    CREATE UNIQUE INDEX ux_albums_identity ON albums(title_key, COALESCE(artist_id, 0));
    CREATE TABLE songs (
        id          INTEGER PRIMARY KEY,
        title       TEXT    NOT NULL,
        title_key   TEXT    NOT NULL,
        artist_id   INTEGER REFERENCES artists(id) ON DELETE RESTRICT,
        album_id    INTEGER REFERENCES albums(id)  ON DELETE SET NULL,
        year        INTEGER,
        cover_url   TEXT,
        difficulty  INTEGER CHECK (difficulty BETWEEN 1 AND 5),
        status      TEXT    NOT NULL DEFAULT 'learning'
                    CHECK (status IN ('wishlist', 'learning', 'practicing', 'mastered')),
        notes       TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX ux_songs_identity ON songs(title_key, COALESCE(artist_id, 0));
    CREATE INDEX ix_songs_artist ON songs(artist_id);
    CREATE INDEX ix_songs_album  ON songs(album_id);
    CREATE TABLE song_credits (
        song_id    INTEGER NOT NULL REFERENCES songs(id)   ON DELETE CASCADE,
        artist_id  INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
        role       TEXT    NOT NULL CHECK (role IN ('composer', 'performer', 'arranger')),
        PRIMARY KEY (song_id, artist_id, role)
    ) WITHOUT ROWID;
    CREATE INDEX ix_song_credits_artist ON song_credits(artist_id);
    CREATE TABLE song_genres (
        song_id   INTEGER NOT NULL REFERENCES songs(id)  ON DELETE CASCADE,
        genre_id  INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
        PRIMARY KEY (song_id, genre_id)
    ) WITHOUT ROWID;
    CREATE INDEX ix_song_genres_genre ON song_genres(genre_id);
    CREATE TABLE song_external_ids (
        song_id      INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        provider     TEXT    NOT NULL CHECK (provider IN ('itunes', 'musicbrainz', 'spotify')),
        external_id  TEXT    NOT NULL,
        PRIMARY KEY (provider, external_id)
    ) WITHOUT ROWID;
    CREATE INDEX ix_song_external_ids_song ON song_external_ids(song_id);

    -- ── Practice ────────────────────────────────────────────────────────────
    CREATE TABLE sessions (
        id                INTEGER PRIMARY KEY,
        started_at        INTEGER NOT NULL,
        ended_at          INTEGER NOT NULL,
        practice_date     TEXT    NOT NULL,
        duration_seconds  INTEGER GENERATED ALWAYS AS ((ended_at - started_at) / 1000) STORED,
        song_id           INTEGER REFERENCES songs(id) ON DELETE RESTRICT,
        practice_type     TEXT CHECK (practice_type IN ('first', 'section', 'full', 'performance')),
        feeling           INTEGER CHECK (feeling BETWEEN 1 AND 5),
        note              TEXT,
        CHECK (ended_at >= started_at)
    );
    CREATE INDEX ix_sessions_date    ON sessions(practice_date);
    CREATE INDEX ix_sessions_started ON sessions(started_at);
    CREATE INDEX ix_sessions_song    ON sessions(song_id);
    CREATE TABLE midi_events (
        session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq          INTEGER NOT NULL,
        relative_ms  INTEGER NOT NULL,
        note         INTEGER NOT NULL CHECK (note BETWEEN 0 AND 127),
        velocity     INTEGER NOT NULL CHECK (velocity BETWEEN 0 AND 127),
        channel      INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_id, seq)
    ) WITHOUT ROWID;
    CREATE TABLE song_status_changes (
        id           INTEGER PRIMARY KEY,
        song_id      INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        from_status  TEXT,
        to_status    TEXT    NOT NULL,
        changed_at   INTEGER NOT NULL,
        session_id   INTEGER REFERENCES sessions(id) ON DELETE SET NULL
    );
    CREATE INDEX ix_status_changes_song    ON song_status_changes(song_id, changed_at);
    CREATE INDEX ix_status_changes_session ON song_status_changes(session_id);

    -- ── Gamification and settings ───────────────────────────────────────────
    CREATE TABLE achievements (
        key          TEXT PRIMARY KEY,
        unlocked_at  INTEGER NOT NULL,
        session_id   INTEGER REFERENCES sessions(id) ON DELETE SET NULL
    );
    CREATE INDEX ix_achievements_session ON achievements(session_id);
    CREATE TABLE goals (
        goal_type       TEXT PRIMARY KEY CHECK (goal_type IN ('daily')),
        target_minutes  INTEGER NOT NULL CHECK (target_minutes > 0)
    );
    CREATE TABLE settings (
        key    TEXT PRIMARY KEY,
        value  TEXT NOT NULL
    );
    INSERT INTO goals (goal_type, target_minutes) VALUES ('daily', 30);
";

/// The pre-v2 tables, as the last pre-v2 build created them. Used so that a
/// database from an even older build has every table and column to copy from.
const LEGACY_TABLES: &str = "
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        start_ts INTEGER NOT NULL,
        end_ts INTEGER NOT NULL,
        duration_seconds INTEGER NOT NULL,
        note TEXT
    );
    CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_type TEXT NOT NULL UNIQUE,
        target_minutes INTEGER NOT NULL DEFAULT 30
    );
    CREATE TABLE IF NOT EXISTS achievements (key TEXT PRIMARY KEY, unlocked_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        artist TEXT,
        genre TEXT,
        album TEXT,
        year INTEGER,
        cover_url TEXT,
        spotify_url TEXT,
        musicbrainz_recording_id TEXT,
        musicbrainz_release_id TEXT,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS midi_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        relative_ms INTEGER NOT NULL,
        note INTEGER NOT NULL,
        velocity INTEGER NOT NULL,
        channel INTEGER NOT NULL DEFAULT 0
    );
";

const LEGACY_COLUMNS: &[(&str, &str, &str)] = &[
    ("sessions", "song_id", "INTEGER"),
    ("sessions", "song_name", "TEXT"),
    ("sessions", "feeling", "INTEGER"),
    ("sessions", "practice_type", "TEXT"),
    ("songs", "status", "TEXT DEFAULT 'learning'"),
    ("songs", "difficulty", "INTEGER"),
];

/// Bring the database to `SCHEMA_VERSION` and turn on foreign key enforcement.
pub fn migrate(conn: &mut Connection) -> rusqlite::Result<()> {
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

fn table_exists(conn: &Connection, name: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        params![name],
        |r| r.get(0),
    )
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let names = stmt.query_map([], |r| r.get::<_, String>(1))?;
    for name in names {
        if name? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Copy the database file next to itself before a destructive migration.
/// An existing backup is kept, so a retried migration never overwrites the
/// original data.
fn backup(conn: &Connection, label: &str) -> rusqlite::Result<()> {
    if let Some(path) = conn.path().filter(|p| !p.is_empty()) {
        let backup = format!("{path}.{label}.bak");
        if !std::path::Path::new(&backup).exists() {
            conn.execute("VACUUM INTO ?1", params![backup])?;
        }
    }
    Ok(())
}

fn check_foreign_keys(tx: &Transaction) -> rusqlite::Result<()> {
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

/// Convert a pre-v2 database: rename the old tables out of the way, create the
/// v1 schema, copy the data across and drop the old tables. Song and session
/// ids are kept. Songs sharing a normalized title and artist are merged.
fn migrate_legacy(tx: &Transaction) -> rusqlite::Result<()> {
    tx.execute_batch(LEGACY_TABLES)?;
    for (table, column, decl) in LEGACY_COLUMNS {
        if !column_exists(tx, table, column)? {
            tx.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {decl}"))?;
        }
    }
    tx.execute_batch("
        ALTER TABLE sessions     RENAME TO legacy_sessions;
        ALTER TABLE songs        RENAME TO legacy_songs;
        ALTER TABLE midi_events  RENAME TO legacy_midi_events;
        ALTER TABLE goals        RENAME TO legacy_goals;
        ALTER TABLE achievements RENAME TO legacy_achievements;
        ALTER TABLE settings     RENAME TO legacy_settings;
    ")?;
    tx.execute_batch(SCHEMA_V1)?;

    // ── Catalog ──
    let songs: Vec<LegacySong> = {
        let mut stmt = tx.prepare(
            "SELECT id, title, artist, genre, album, year, cover_url,
                    musicbrainz_recording_id, created_at, status, difficulty
             FROM legacy_songs ORDER BY id",
        )?;
        let rows = stmt.query_map([], |r| Ok(LegacySong {
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
        }))?;
        rows.collect::<Result<_, _>>()?
    };

    let mut song_ids: HashMap<i64, i64> = HashMap::new();
    for s in &songs {
        if db::name_key(&s.title).is_empty() {
            continue;
        }
        // Older builds stored created_at in seconds; everything is ms now.
        let created_at = if s.created_at < 100_000_000_000 { s.created_at * 1000 } else { s.created_at };
        let status = s.status.as_deref()
            .filter(|st| db::status_rank(st).is_some())
            .unwrap_or("learning");
        let difficulty = s.difficulty.filter(|d| (1..=5).contains(d));
        let new = NewSong {
            title: &s.title,
            artist: s.artist.as_deref(),
            genre: s.genre.as_deref(),
            album: s.album.as_deref(),
            year: s.year,
            cover_url: s.cover_url.as_deref(),
            itunes_track_id: None,
            difficulty,
        };
        let id = db::find_or_create_song(tx, &new, created_at, Some(s.id))?;
        if let Some(ext) = s.recording_id.as_deref().map(str::trim).filter(|e| !e.is_empty()) {
            // The column kept its MusicBrainz name after the switch to iTunes.
            let provider = if ext.chars().all(|c| c.is_ascii_digit()) { "itunes" } else { "musicbrainz" };
            tx.execute(
                "INSERT OR IGNORE INTO song_external_ids (song_id, provider, external_id) VALUES (?1, ?2, ?3)",
                params![id, provider, ext],
            )?;
        }
        // A merged duplicate keeps the most advanced status and earliest date.
        tx.execute(
            "UPDATE songs SET
                status = CASE WHEN ?2 > (CASE status WHEN 'wishlist' THEN 0 WHEN 'learning' THEN 1
                                                      WHEN 'practicing' THEN 2 ELSE 3 END)
                              THEN ?3 ELSE status END,
                created_at = MIN(created_at, ?4),
                updated_at = MIN(updated_at, ?4)
             WHERE id = ?1",
            params![id, db::status_rank(status), status, created_at],
        )?;
        song_ids.insert(s.id, id);
    }

    tx.execute_batch("CREATE TEMP TABLE song_id_map (old_id INTEGER PRIMARY KEY, new_id INTEGER NOT NULL)")?;
    {
        let mut stmt = tx.prepare("INSERT INTO temp.song_id_map (old_id, new_id) VALUES (?1, ?2)")?;
        for (old, new) in &song_ids {
            stmt.execute(params![old, new])?;
        }
    }

    // ── Practice ──
    tx.execute_batch("
        INSERT INTO sessions (id, started_at, ended_at, practice_date, song_id, practice_type, feeling, note)
        SELECT s.id, s.start_ts, MAX(s.end_ts, s.start_ts), s.date, m.new_id,
               CASE WHEN s.practice_type IN ('first', 'section', 'full', 'performance') THEN s.practice_type END,
               CASE WHEN s.feeling BETWEEN 1 AND 5 THEN s.feeling END,
               s.note
        FROM legacy_sessions s
        LEFT JOIN temp.song_id_map m ON m.old_id = s.song_id;

        INSERT INTO midi_events (session_id, seq, relative_ms, note, velocity, channel)
        SELECT session_id, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY id) - 1,
               relative_ms, note, velocity, channel
        FROM legacy_midi_events
        WHERE session_id IN (SELECT id FROM sessions)
          AND note BETWEEN 0 AND 127 AND velocity BETWEEN 0 AND 127;

        -- One history entry per song, at its final (merged) status.
        DELETE FROM song_status_changes;
        INSERT INTO song_status_changes (song_id, from_status, to_status, changed_at)
        SELECT id, NULL, status, created_at FROM songs;

        -- ── Gamification and settings ──
        INSERT INTO achievements (key, unlocked_at)
        SELECT key, CASE WHEN unlocked_at < 100000000000 THEN unlocked_at * 1000 ELSE unlocked_at END
        FROM legacy_achievements;

        INSERT OR REPLACE INTO goals (goal_type, target_minutes)
        SELECT goal_type, target_minutes FROM legacy_goals
        WHERE goal_type = 'daily' AND target_minutes > 0;

        INSERT INTO settings (key, value)
        SELECT key, value FROM legacy_settings WHERE value IS NOT NULL;

        DROP TABLE temp.song_id_map;
        DROP TABLE legacy_midi_events;
        DROP TABLE legacy_sessions;
        DROP TABLE legacy_songs;
        DROP TABLE legacy_goals;
        DROP TABLE legacy_achievements;
        DROP TABLE legacy_settings;
    ")?;
    Ok(())
}

#[cfg(test)]
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
        let songs: Vec<(i64, String, Option<String>, String, Option<i32>)> = conn.prepare(
            "SELECT s.id, s.title, a.name, s.status, s.difficulty FROM songs s
             LEFT JOIN artists a ON a.id = s.artist_id ORDER BY s.id",
        ).unwrap().query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))
            .unwrap().collect::<Result<_, _>>().unwrap();
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
        let sessions: Vec<(i64, Option<i64>, i64, Option<i64>, Option<String>)> = conn.prepare(
            "SELECT id, song_id, duration_seconds, feeling, practice_type FROM sessions ORDER BY id",
        ).unwrap().query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))
            .unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(sessions, vec![
            (10, Some(1), 60, Some(4), Some("full".into())),
            (11, Some(1), 0, None, None),
            (12, None, 60, None, None),
            (13, None, 60, None, None),
        ]);

        // MIDI events keep insertion order; orphans are dropped.
        let midi: Vec<(i64, i64, i64)> = conn.prepare(
            "SELECT session_id, seq, relative_ms FROM midi_events ORDER BY session_id, seq",
        ).unwrap().query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap().collect::<Result<_, _>>().unwrap();
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
