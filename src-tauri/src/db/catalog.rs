//! The song catalog: songs with their artist, album and genres.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use super::{query_all, Database, Result, SessionRecord};
use crate::time::now_ms;

/// A song from the catalog, with its artist, album and genres resolved and its
/// practice totals computed from the sessions linked to it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongRecord {
    pub id: i64,
    pub title: String,
    pub artist_id: Option<i64>,
    pub artist: Option<String>,
    pub album_id: Option<i64>,
    pub album: Option<String>,
    /// First genre, used for grouping; `genres` holds them all.
    pub genre: Option<String>,
    pub genres: Vec<String>,
    pub year: Option<i32>,
    /// The song's own cover, else its album's.
    pub cover_url: Option<String>,
    pub created_at: i64,
    pub status: String,
    pub difficulty: Option<i32>,
    pub total_seconds: i64,
    pub session_count: i64,
    pub last_played_date: Option<String>,
    pub avg_feeling: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongDetail {
    pub song: SongRecord,
    pub sessions: Vec<SessionRecord>,
}

/// Song details as they come from a search result or a title typed by hand.
pub struct NewSong<'a> {
    pub title: &'a str,
    pub artist: Option<&'a str>,
    pub genre: Option<&'a str>,
    pub album: Option<&'a str>,
    pub year: Option<i32>,
    pub cover_url: Option<&'a str>,
    pub itunes_track_id: Option<&'a str>,
    pub difficulty: Option<i32>,
}

/// Normalized identity of a name: trimmed, inner whitespace collapsed, lowercase.
pub fn name_key(name: &str) -> String {
    name.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// A trimmed value, or `None` when blank.
fn clean(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|v| !v.is_empty())
}

// ── Find-or-create helpers (shared with the migration) ───────────────────────

fn artist_id(conn: &Connection, name: &str, now: i64) -> Result<i64> {
    let key = name_key(name);
    let existing = conn.query_row(
        "SELECT id FROM artists WHERE name_key = ?1", params![key], |r| r.get(0),
    ).optional()?;
    if let Some(id) = existing {
        return Ok(id);
    }
    conn.execute(
        "INSERT INTO artists (name, name_key, created_at) VALUES (?1, ?2, ?3)",
        params![name.trim(), key, now],
    )?;
    Ok(conn.last_insert_rowid())
}

fn genre_id(conn: &Connection, name: &str) -> Result<i64> {
    let key = name_key(name);
    let existing = conn.query_row(
        "SELECT id FROM genres WHERE name_key = ?1", params![key], |r| r.get(0),
    ).optional()?;
    if let Some(id) = existing {
        return Ok(id);
    }
    conn.execute("INSERT INTO genres (name, name_key) VALUES (?1, ?2)", params![name.trim(), key])?;
    Ok(conn.last_insert_rowid())
}

/// Find or create an album; an existing one gets its missing year and cover filled.
fn album_id(
    conn: &Connection,
    title: &str,
    artist_id: Option<i64>,
    year: Option<i32>,
    cover_url: Option<&str>,
) -> Result<i64> {
    let key = name_key(title);
    let existing = conn.query_row(
        "SELECT id FROM albums WHERE title_key = ?1 AND COALESCE(artist_id, 0) = COALESCE(?2, 0)",
        params![key, artist_id],
        |r| r.get(0),
    ).optional()?;
    if let Some(id) = existing {
        conn.execute(
            "UPDATE albums SET year = COALESCE(year, ?2), cover_url = COALESCE(cover_url, ?3) WHERE id = ?1",
            params![id, year, cover_url],
        )?;
        return Ok(id);
    }
    conn.execute(
        "INSERT INTO albums (title, title_key, artist_id, year, cover_url) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![title.trim(), key, artist_id, year, cover_url],
    )?;
    Ok(conn.last_insert_rowid())
}

fn add_genre(conn: &Connection, song_id: i64, genre: &str) -> Result<()> {
    let gid = genre_id(conn, genre)?;
    conn.execute(
        "INSERT OR IGNORE INTO song_genres (song_id, genre_id) VALUES (?1, ?2)",
        params![song_id, gid],
    )?;
    Ok(())
}

/// The song with this normalized title and artist. A title without an
/// artist matches any song with that title.
fn find_by_title(conn: &Connection, title_key: &str, artist_id: Option<i64>) -> Result<Option<i64>> {
    match artist_id {
        Some(a) => conn.query_row(
            "SELECT id FROM songs WHERE title_key = ?1 AND artist_id = ?2",
            params![title_key, a],
            |r| r.get(0),
        ).optional(),
        None => conn.query_row(
            "SELECT id FROM songs WHERE title_key = ?1 ORDER BY artist_id IS NOT NULL, id LIMIT 1",
            params![title_key],
            |r| r.get(0),
        ).optional(),
    }
}

/// The song (and its artist) already linked to this iTunes track.
fn itunes_song(conn: &Connection, itunes_id: Option<&str>) -> Result<Option<(i64, Option<i64>)>> {
    let Some(ext) = itunes_id else { return Ok(None) };
    conn.query_row(
        "SELECT s.id, s.artist_id FROM song_external_ids x JOIN songs s ON s.id = x.song_id
         WHERE x.provider = 'itunes' AND x.external_id = ?1",
        params![ext],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).optional()
}

/// Return the catalog entry for this song, creating it if needed. A song is
/// matched by iTunes track id first, else by title + artist. Details an existing entry is missing are filled in, never
/// overwritten. `id` forces the id of a newly created song (used by the migration).
pub fn find_or_create_song(conn: &Connection, song: &NewSong, now: i64, id: Option<i64>) -> Result<i64> {
    let title = song.title.trim();
    let title_key = name_key(title);
    if title_key.is_empty() {
        return Err(rusqlite::Error::InvalidParameterName("song title must not be empty".into()));
    }
    let itunes_id = clean(song.itunes_track_id);

    let by_track = itunes_song(conn, itunes_id)?;
    // Matched by track id: keep the artist the catalog already has.
    let artist = match (by_track, clean(song.artist)) {
        (Some((_, artist)), _) => artist,
        (None, Some(name)) => Some(artist_id(conn, name, now)?),
        (None, None) => None,
    };
    let existing = match by_track {
        Some((id, _)) => Some(id),
        None => find_by_title(conn, &title_key, artist)?,
    };

    let album = clean(song.album)
        .map(|t| album_id(conn, t, artist, song.year, clean(song.cover_url)))
        .transpose()?;
    // The cover lives on the album when there is one.
    let cover = if album.is_some() { None } else { clean(song.cover_url) };

    let song_id = match existing {
        Some(sid) => {
            conn.execute(
                "UPDATE songs SET album_id   = COALESCE(album_id, ?2),
                                  year       = COALESCE(year, ?3),
                                  cover_url  = COALESCE(cover_url, ?4),
                                  difficulty = COALESCE(difficulty, ?5)
                 WHERE id = ?1",
                params![sid, album, song.year, cover, song.difficulty],
            )?;
            sid
        }
        None => {
            conn.execute(
                "INSERT INTO songs (id, title, title_key, artist_id, album_id, year, cover_url,
                                    difficulty, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
                params![id, title, title_key, artist, album, song.year, cover, song.difficulty, now],
            )?;
            let sid = conn.last_insert_rowid();
            conn.execute(
                "INSERT INTO song_status_changes (song_id, from_status, to_status, changed_at)
                 SELECT id, NULL, status, ?2 FROM songs WHERE id = ?1",
                params![sid, now],
            )?;
            sid
        }
    };

    if let Some(g) = clean(song.genre) {
        add_genre(conn, song_id, g)?;
    }
    if let Some(ext) = itunes_id {
        conn.execute(
            "INSERT OR IGNORE INTO song_external_ids (song_id, provider, external_id) VALUES (?1, 'itunes', ?2)",
            params![song_id, ext],
        )?;
    }
    Ok(song_id)
}

// ── Reading songs ────────────────────────────────────────────────────────────

/// Columns read by `row_to_song`, in order. Needs `SONG_JOINS` on alias `sg`.
pub(super) const SONG_COLUMNS: &str = "
    sg.id, sg.title, sg.artist_id, ar.name, sg.album_id, al.title,
    (SELECT GROUP_CONCAT(name, char(31)) FROM (
        SELECT g.name FROM song_genres x JOIN genres g ON g.id = x.genre_id
        WHERE x.song_id = sg.id ORDER BY g.id)),
    sg.year, COALESCE(sg.cover_url, al.cover_url), sg.created_at, sg.status, sg.difficulty,
    COALESCE(st.total_seconds, 0), COALESCE(st.session_count, 0),
    st.last_played_date, st.avg_feeling";

pub(super) const SONG_JOINS: &str = "
    LEFT JOIN artists ar ON ar.id = sg.artist_id
    LEFT JOIN albums  al ON al.id = sg.album_id
    LEFT JOIN (SELECT song_id,
                      SUM(duration_seconds) AS total_seconds,
                      COUNT(*)              AS session_count,
                      MAX(practice_date)    AS last_played_date,
                      AVG(feeling)          AS avg_feeling,
                      MAX(started_at)       AS last_started_at
               FROM sessions WHERE song_id IS NOT NULL GROUP BY song_id) st
           ON st.song_id = sg.id";

fn song_query(tail: &str) -> String {
    format!("SELECT {SONG_COLUMNS} FROM songs sg {SONG_JOINS} {tail}")
}

/// Read a song whose `SONG_COLUMNS` start at column `o`.
pub(super) fn row_to_song(row: &Row, o: usize) -> Result<SongRecord> {
    let genres: Vec<String> = row.get::<_, Option<String>>(o + 6)?
        .map(|g| g.split('\u{1f}').map(str::to_string).collect())
        .unwrap_or_default();
    Ok(SongRecord {
        id: row.get(o)?,
        title: row.get(o + 1)?,
        artist_id: row.get(o + 2)?,
        artist: row.get(o + 3)?,
        album_id: row.get(o + 4)?,
        album: row.get(o + 5)?,
        genre: genres.first().cloned(),
        genres,
        year: row.get(o + 7)?,
        cover_url: row.get(o + 8)?,
        created_at: row.get(o + 9)?,
        status: row.get(o + 10)?,
        difficulty: row.get(o + 11)?,
        total_seconds: row.get(o + 12)?,
        session_count: row.get(o + 13)?,
        last_played_date: row.get(o + 14)?,
        avg_feeling: row.get(o + 15)?,
    })
}

impl Database {
    pub fn create_song(&self, song: &NewSong) -> Result<i64> {
        self.transaction(|tx| find_or_create_song(tx, song, now_ms(), None))
    }

    /// Make `genre` the song's only genre.
    pub fn update_song_genre(&self, song_id: i64, genre: &str) -> Result<()> {
        self.transaction(|tx| {
            tx.execute("DELETE FROM song_genres WHERE song_id = ?1", params![song_id])?;
            match clean(Some(genre)) {
                Some(name) => add_genre(tx, song_id, name),
                None => Ok(()),
            }
        })
    }

    pub fn update_song_difficulty(&self, song_id: i64, difficulty: Option<i32>) -> Result<()> {
        self.conn().execute(
            "UPDATE songs SET difficulty = ?1, updated_at = ?2 WHERE id = ?3",
            params![difficulty, now_ms(), song_id],
        )?;
        Ok(())
    }

    /// Every song in the catalog, by title.
    pub fn get_songs(&self) -> Result<Vec<SongRecord>> {
        query_all(&self.conn(), &song_query("ORDER BY sg.title COLLATE NOCASE"), [], |r| row_to_song(r, 0))
    }

    /// Every song in the catalog, most practised first.
    pub fn get_song_stats(&self) -> Result<Vec<SongRecord>> {
        query_all(
            &self.conn(),
            &song_query("ORDER BY COALESCE(st.total_seconds, 0) DESC, sg.title COLLATE NOCASE"),
            [],
            |r| row_to_song(r, 0),
        )
    }

    /// Songs with at least one session, most recently played first.
    pub fn get_recent_songs(&self, limit: i32) -> Result<Vec<SongRecord>> {
        query_all(
            &self.conn(),
            &song_query("WHERE st.session_count > 0 ORDER BY st.last_started_at DESC LIMIT ?1"),
            params![limit],
            |r| row_to_song(r, 0),
        )
    }

    pub fn get_song(&self, song_id: i64) -> Result<Option<SongRecord>> {
        self.conn()
            .query_row(&song_query("WHERE sg.id = ?1"), params![song_id], |r| row_to_song(r, 0))
            .optional()
    }

    pub fn get_song_with_sessions(&self, song_id: i64) -> Result<Option<SongDetail>> {
        let Some(song) = self.get_song(song_id)? else { return Ok(None) };
        let sessions = self.get_sessions_for_song(song_id)?;
        Ok(Some(SongDetail { song, sessions }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_db;

    fn song<'a>(title: &'a str, artist: Option<&'a str>, itunes: Option<&'a str>) -> NewSong<'a> {
        NewSong {
            title, artist, genre: Some("Classical"), album: Some("Album"), year: Some(2004),
            cover_url: Some("cover.jpg"), itunes_track_id: itunes, difficulty: None,
        }
    }

    #[test]
    fn create_song_reuses_catalog_entries() {
        let db = test_db();
        let a = db.create_song(&song("Clair de Lune", Some("Claude Debussy"), Some("123"))).unwrap();
        // Same title and artist, different spelling: same song.
        assert_eq!(db.create_song(&song(" clair  de lune ", Some("claude debussy"), None)).unwrap(), a);
        // Same iTunes track: same song even if the title differs.
        assert_eq!(db.create_song(&song("Clair de lune (Remastered)", Some("Debussy"), Some("123"))).unwrap(), a);
        // Title typed without an artist matches the existing song.
        assert_eq!(db.create_song(&song("Clair de lune", None, None)).unwrap(), a);
        // Same title by another artist is a different song.
        assert_ne!(db.create_song(&song("Clair de Lune", Some("Someone Else"), None)).unwrap(), a);

        let s = db.get_song(a).unwrap().unwrap();
        assert_eq!(s.artist.as_deref(), Some("Claude Debussy"));
        assert_eq!(s.album.as_deref(), Some("Album"));
        assert_eq!(s.cover_url.as_deref(), Some("cover.jpg"));
        assert_eq!(s.genres, vec!["Classical".to_string()]);
        assert_eq!(s.status, "learning");
        // The iTunes match kept the catalog's artist instead of adding "Debussy".
        let artists: i64 = db.conn().query_row("SELECT COUNT(*) FROM artists", [], |r| r.get(0)).unwrap();
        assert_eq!(artists, 2);
    }

    #[test]
    fn songs_outlive_their_sessions() {
        let db = test_db();
        let song_id = db.create_song(&song("Gymnopédie No. 1", Some("Erik Satie"), None)).unwrap();
        let s = db.insert_session("2026-10-01", 0, 60_000).unwrap();
        db.tag_session(s, Some(song_id), Some(4), Some("full"), None).unwrap();

        let tagged = db.get_session(s).unwrap().unwrap();
        assert_eq!(tagged.song.as_ref().map(|s| s.title.as_str()), Some("Gymnopédie No. 1"));
        assert_eq!(tagged.song.as_ref().map(|s| s.session_count), Some(1));

        db.unlink_session_song(s).unwrap();
        let detail = db.get_song_with_sessions(song_id).unwrap().unwrap();
        assert_eq!(detail.song.session_count, 0);
        assert!(detail.sessions.is_empty());
        assert!(db.get_recent_songs(5).unwrap().is_empty());
    }
}
