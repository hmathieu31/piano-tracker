//! The notes recorded during a session.

use rusqlite::params;
use serde::{Deserialize, Serialize};
use super::{query_all, Database, Result};

/// One note-on or note-off; a note-off is stored with velocity 0.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiEventRecord {
    pub relative_ms: i64,
    pub note: u8,
    pub velocity: u8,
    pub channel: u8,
}

impl Database {
    /// Append events to a session, after any it already has.
    pub fn insert_midi_events(&self, session_id: i64, events: &[MidiEventRecord]) -> Result<()> {
        self.transaction(|tx| {
            let first_seq: i64 = tx.query_row(
                "SELECT COALESCE(MAX(seq) + 1, 0) FROM midi_events WHERE session_id = ?1",
                params![session_id],
                |r| r.get(0),
            )?;
            let mut stmt = tx.prepare(
                "INSERT INTO midi_events (session_id, seq, relative_ms, note, velocity, channel)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )?;
            for (seq, e) in (first_seq..).zip(events) {
                stmt.execute(params![session_id, seq, e.relative_ms, e.note, e.velocity, e.channel])?;
            }
            Ok(())
        })
    }

    pub fn get_midi_events(&self, session_id: i64) -> Result<Vec<MidiEventRecord>> {
        query_all(
            &self.conn(),
            "SELECT relative_ms, note, velocity, channel FROM midi_events
             WHERE session_id = ?1 ORDER BY seq",
            params![session_id],
            |row| Ok(MidiEventRecord {
                relative_ms: row.get(0)?,
                note: row.get(1)?,
                velocity: row.get(2)?,
                channel: row.get(3)?,
            }),
        )
    }
}
