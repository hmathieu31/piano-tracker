//! Mastery stages (learning → practicing → mastered) and the rules that
//! suggest when a song is ready to advance.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use super::{query_all, Database, Result};
use crate::time::now_ms;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MasterySuggestion {
    pub song_id: i64,
    pub song_title: String,
    pub current_status: String,
    pub suggested_status: String,
}

/// Order of the mastery stages; `None` for an unknown status.
pub fn status_rank(status: &str) -> Option<i32> {
    match status {
        "wishlist" => Some(0),
        "learning" => Some(1),
        "practicing" => Some(2),
        "mastered" => Some(3),
        _ => None,
    }
}

/// When a song at stage `from` is suggested to move to `to`: it has at
/// least `window` sessions, and among the last `window` at least
/// `min_rated` have a mood whose average is at least `min_avg_feeling`.
struct AdvanceRule {
    from: &'static str,
    to: &'static str,
    window: usize,
    min_rated: usize,
    min_avg_feeling: f64,
}

const RULES: &[AdvanceRule] = &[
    AdvanceRule { from: "learning", to: "practicing", window: 5, min_rated: 0, min_avg_feeling: 0.0 },
    AdvanceRule { from: "practicing", to: "mastered", window: 7, min_rated: 5, min_avg_feeling: 4.0 },
];

impl AdvanceRule {
    /// `recent` holds the moods of the song's latest sessions, newest first.
    fn is_met(&self, recent: &[Option<i64>]) -> bool {
        if recent.len() < self.window {
            return false;
        }
        let rated: Vec<i64> = recent.iter().take(self.window).filter_map(|f| *f).collect();
        if rated.len() < self.min_rated {
            return false;
        }
        rated.is_empty() || rated.iter().sum::<i64>() as f64 / rated.len() as f64 >= self.min_avg_feeling
    }
}

/// The next stage this song is ready for, if any.
pub(super) fn suggestion(conn: &Connection, song_id: i64) -> Result<Option<MasterySuggestion>> {
    let (title, current): (String, String) = conn.query_row(
        "SELECT title, status FROM songs WHERE id = ?1",
        params![song_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let Some(rule) = RULES.iter().find(|r| r.from == current) else { return Ok(None) };
    let recent: Vec<Option<i64>> = query_all(
        conn,
        "SELECT feeling FROM sessions WHERE song_id = ?1 ORDER BY started_at DESC LIMIT ?2",
        params![song_id, rule.window as i64],
        |r| r.get(0),
    )?;
    Ok(rule.is_met(&recent).then(|| MasterySuggestion {
        song_id,
        song_title: title,
        current_status: current,
        suggested_status: rule.to.to_string(),
    }))
}

/// Move a song to a new mastery stage and record the change.
pub(super) fn change_status(conn: &Connection, song_id: i64, status: &str, session_id: Option<i64>) -> Result<()> {
    let current: String = conn.query_row(
        "SELECT status FROM songs WHERE id = ?1", params![song_id], |r| r.get(0),
    )?;
    if current == status {
        return Ok(());
    }
    let now = now_ms();
    conn.execute(
        "UPDATE songs SET status = ?2, updated_at = ?3 WHERE id = ?1",
        params![song_id, status, now],
    )?;
    conn.execute(
        "INSERT INTO song_status_changes (song_id, from_status, to_status, changed_at, session_id)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![song_id, current, status, now, session_id],
    )?;
    Ok(())
}

impl Database {
    /// The next stage this song is ready for, if any.
    pub fn mastery_suggestion(&self, song_id: i64) -> Result<Option<MasterySuggestion>> {
        suggestion(&self.conn(), song_id)
    }

    pub fn set_song_status(&self, song_id: i64, status: &str) -> Result<()> {
        self.transaction(|tx| change_status(tx, song_id, status, None))
    }

    /// Advance a song's mastery status after the user confirms a suggestion.
    /// The change is credited to the song's latest session, which triggered it.
    pub fn confirm_mastery_advance(&self, song_id: i64, new_status: &str) -> Result<()> {
        self.transaction(|tx| {
            let latest: Option<i64> = tx.query_row(
                "SELECT id FROM sessions WHERE song_id = ?1 ORDER BY started_at DESC LIMIT 1",
                params![song_id],
                |r| r.get(0),
            ).optional()?;
            change_status(tx, song_id, new_status, latest)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{test_db, NewSong};

    #[test]
    fn rules_follow_recent_sessions() {
        let [learning, practicing] = [&RULES[0], &RULES[1]];
        assert!(learning.is_met(&[None; 5]));
        assert!(!learning.is_met(&[Some(5); 4]));
        assert!(practicing.is_met(&[Some(4), Some(5), Some(4), Some(4), Some(4), None, None]));
        // Too few rated sessions, or a mood below Good on average.
        assert!(!practicing.is_met(&[Some(5), Some(5), Some(5), Some(5), None, None, None]));
        assert!(!practicing.is_met(&[Some(3), Some(3), Some(4), Some(4), Some(4), None, None]));
    }

    #[test]
    fn mastery_changes_are_recorded() {
        let db = test_db();
        let song_id = db.create_song(&NewSong {
            title: "Nuvole Bianche", artist: Some("Ludovico Einaudi"), genre: None, album: None,
            year: None, cover_url: None, itunes_track_id: None, difficulty: None,
        }).unwrap();
        let mut suggestion = None;
        for i in 0..5 {
            let start = i * 100_000;
            let s = db.insert_session("2026-10-01", start, start + 60_000).unwrap();
            suggestion = db.tag_session(s, Some(song_id), Some(4), None, None).unwrap();
            if i < 4 { assert!(suggestion.is_none()); }
        }
        let suggestion = suggestion.expect("five sessions while learning suggest advancing");
        assert_eq!(suggestion.suggested_status, "practicing");
        db.confirm_mastery_advance(song_id, &suggestion.suggested_status).unwrap();

        let history: Vec<(Option<String>, String, Option<i64>)> = query_all(
            &db.conn(),
            "SELECT from_status, to_status, session_id FROM song_status_changes WHERE song_id = ?1 ORDER BY id",
            params![song_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).unwrap();
        assert_eq!(history, vec![
            (None, "learning".into(), None),
            (Some("learning".into()), "practicing".into(), Some(5)),
        ]);
    }
}
