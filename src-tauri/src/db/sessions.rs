//! Practice sessions: one continuous stretch of playing, on at most one song.

use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use super::catalog::{row_to_song, SONG_COLUMNS, SONG_JOINS};
use super::{query_all, Database, MasterySuggestion, Result, SongRecord};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: i64,
    /// Local practice day (YYYY-MM-DD) the session counts towards.
    pub date: String,
    pub start_ts: i64,
    pub end_ts: i64,
    pub duration_seconds: i64,
    pub note: Option<String>,
    pub song_id: Option<i64>,
    pub feeling: Option<i64>,
    pub practice_type: Option<String>,
    pub song: Option<SongRecord>,
}

fn session_query(tail: &str) -> String {
    format!(
        "SELECT s.id, s.practice_date, s.started_at, s.ended_at, s.duration_seconds, s.note,
                s.song_id, s.feeling, s.practice_type, {SONG_COLUMNS}
         FROM sessions s LEFT JOIN songs sg ON sg.id = s.song_id {SONG_JOINS} {tail}"
    )
}

fn row_to_session(row: &Row) -> Result<SessionRecord> {
    const SONG_AT: usize = 9;
    let song = match row.get::<_, Option<i64>>(SONG_AT)? {
        Some(_) => Some(row_to_song(row, SONG_AT)?),
        None => None,
    };
    Ok(SessionRecord {
        id: row.get(0)?,
        date: row.get(1)?,
        start_ts: row.get(2)?,
        end_ts: row.get(3)?,
        duration_seconds: row.get(4)?,
        note: row.get(5)?,
        song_id: row.get(6)?,
        feeling: row.get(7)?,
        practice_type: row.get(8)?,
        song,
    })
}

impl Database {
    pub fn insert_session(&self, date: &str, start_ts: i64, end_ts: i64) -> Result<i64> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO sessions (practice_date, started_at, ended_at) VALUES (?1, ?2, ?3)",
            params![date, start_ts, end_ts],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_session(&self, id: i64) -> Result<Option<SessionRecord>> {
        self.conn().query_row(&session_query("WHERE s.id = ?1"), params![id], row_to_session).optional()
    }

    pub fn get_sessions(&self, limit: i32) -> Result<Vec<SessionRecord>> {
        query_all(&self.conn(), &session_query("ORDER BY s.started_at DESC LIMIT ?1"), params![limit], row_to_session)
    }

    pub fn get_sessions_for_song(&self, song_id: i64) -> Result<Vec<SessionRecord>> {
        query_all(
            &self.conn(),
            &session_query("WHERE s.song_id = ?1 ORDER BY s.started_at DESC"),
            params![song_id],
            row_to_session,
        )
    }

    pub fn update_session_note(&self, id: i64, note: &str) -> Result<()> {
        self.conn().execute("UPDATE sessions SET note = ?1 WHERE id = ?2", params![note, id])?;
        Ok(())
    }

    pub fn set_session_feeling(&self, session_id: i64, feeling: Option<i64>) -> Result<()> {
        self.conn().execute("UPDATE sessions SET feeling = ?1 WHERE id = ?2", params![feeling, session_id])?;
        Ok(())
    }

    /// Link a session to a song, or unlink it with `None`. The song stays in
    /// the catalog either way.
    pub fn set_session_song(&self, session_id: i64, song_id: Option<i64>) -> Result<()> {
        self.conn().execute("UPDATE sessions SET song_id = ?1 WHERE id = ?2", params![song_id, session_id])?;
        Ok(())
    }

    pub fn link_session_song(&self, session_id: i64, song_id: i64) -> Result<()> {
        self.set_session_song(session_id, Some(song_id))
    }

    pub fn unlink_session_song(&self, session_id: i64) -> Result<()> {
        self.set_session_song(session_id, None)
    }

    /// Tag a session: atomically set song, feeling, practice_type and note, then
    /// check whether the song is ready to advance to the next mastery stage.
    pub fn tag_session(
        &self,
        session_id: i64,
        song_id: Option<i64>,
        feeling: Option<i64>,
        practice_type: Option<&str>,
        note: Option<&str>,
    ) -> Result<Option<MasterySuggestion>> {
        let conn = self.conn();
        conn.execute(
            "UPDATE sessions SET song_id = ?1, feeling = ?2, practice_type = ?3,
                     note = COALESCE(?4, note)
             WHERE id = ?5",
            params![song_id, feeling, practice_type, note, session_id],
        )?;
        match song_id {
            Some(sid) => super::mastery::suggestion(&conn, sid),
            None => Ok(None),
        }
    }

    /// Crop sessions whose saved end is far past the last note actually played
    /// (e.g. the laptop slept mid-session, so the end was only detected on resume).
    /// The session is trimmed to its last note-on plus `silence_ms`, matching where
    /// a normal session ends, and MIDI events past that point are dropped.
    /// Sessions without recorded notes are left alone. Returns the number cropped.
    pub fn crop_runaway_sessions(&self, silence_ms: i64) -> Result<usize> {
        // Normal sessions end at last note + silence (+ up to one 500ms debounce
        // tick), so only touch sessions that overshoot by more than a minute.
        const SLACK_MS: i64 = 60_000;
        self.transaction(|tx| {
            let candidates: Vec<(i64, i64, i64)> = query_all(
                tx,
                "SELECT s.id, s.started_at, MAX(m.relative_ms) FROM sessions s
                 JOIN midi_events m ON m.session_id = s.id AND m.velocity > 0
                 GROUP BY s.id
                 HAVING s.ended_at > s.started_at + MAX(m.relative_ms) + ?1",
                params![silence_ms + SLACK_MS],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )?;
            for (id, start_ts, last_note_ms) in &candidates {
                let cutoff_ms = last_note_ms + silence_ms;
                let end_ts = start_ts + cutoff_ms;
                // Sessions are dated by their end, like when they are first saved.
                tx.execute(
                    "UPDATE sessions SET ended_at = ?1, practice_date = ?2 WHERE id = ?3",
                    params![end_ts, crate::time::local_day(end_ts), id],
                )?;
                tx.execute(
                    "DELETE FROM midi_events WHERE session_id = ?1 AND relative_ms > ?2",
                    params![id, cutoff_ms],
                )?;
            }
            Ok(candidates.len())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{test_db, MidiEventRecord, NewSong};

    fn note(relative_ms: i64, velocity: u8) -> MidiEventRecord {
        MidiEventRecord { relative_ms, note: 60, velocity, channel: 0 }
    }

    fn timing(db: &Database, id: i64) -> (i64, i64, i64) {
        let s = db.get_session(id).unwrap().unwrap();
        (s.start_ts, s.end_ts, s.duration_seconds)
    }

    #[test]
    fn crops_runaway_session_to_last_note_plus_silence() {
        let db = test_db();
        let start = 1_700_000_000_000;
        // Played for 10 minutes, then the session ran on for 10 hours.
        let runaway = db.insert_session("2023-11-14", start, start + 36_000_000).unwrap();
        db.insert_midi_events(runaway, &[note(0, 80), note(600_000, 80), note(605_000, 0), note(700_000, 0)]).unwrap();
        // A normal session ending 10.4s after its last note.
        let normal = db.insert_session("2023-11-14", start, start + 130_400).unwrap();
        db.insert_midi_events(normal, &[note(0, 80), note(120_000, 80)]).unwrap();
        // An old session recorded before MIDI capture existed.
        let no_midi = db.insert_session("2023-11-14", start, start + 36_000_000).unwrap();

        assert_eq!(db.crop_runaway_sessions(10_000).unwrap(), 1);

        assert_eq!(timing(&db, runaway), (start, start + 610_000, 610));
        let kept: Vec<i64> = db.get_midi_events(runaway).unwrap().iter().map(|e| e.relative_ms).collect();
        assert_eq!(kept, vec![0, 600_000, 605_000]);
        assert_eq!(timing(&db, normal), (start, start + 130_400, 130));
        assert_eq!(timing(&db, no_midi), (start, start + 36_000_000, 36_000));

        // Idempotent: a second run finds nothing left to crop.
        assert_eq!(db.crop_runaway_sessions(10_000).unwrap(), 0);
    }

    #[test]
    fn foreign_keys_and_checks_are_enforced() {
        let db = test_db();
        let song_id = db.create_song(&NewSong {
            title: "Für Elise", artist: Some("Beethoven"), genre: None, album: None, year: None,
            cover_url: None, itunes_track_id: None, difficulty: None,
        }).unwrap();
        let s = db.insert_session("2026-10-01", 0, 60_000).unwrap();
        db.insert_midi_events(s, &[note(0, 80)]).unwrap();
        db.link_session_song(s, song_id).unwrap();

        assert!(db.link_session_song(s, 999).is_err());
        assert!(db.tag_session(s, Some(song_id), Some(9), None, None).is_err());
        assert!(db.tag_session(s, Some(song_id), None, Some("noodling"), None).is_err());
        assert!(db.set_song_status(song_id, "legendary").is_err());

        let conn = db.conn();
        // A song with practice history cannot be deleted.
        assert!(conn.execute("DELETE FROM songs WHERE id = ?1", params![song_id]).is_err());
        // Deleting a session removes its MIDI events.
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![s]).unwrap();
        let left: i64 = conn.query_row("SELECT COUNT(*) FROM midi_events", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 0);
    }
}
