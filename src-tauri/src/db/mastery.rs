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

/// When a song at stage `from` is suggested to move to `to`: among its last
/// `window` tagged sessions, at least `min_strong` have a practice type in
/// `strong`, and the average feeling is at least `min_avg_feeling`.
struct AdvanceRule {
    from: &'static str,
    to: &'static str,
    window: usize,
    strong: &'static [&'static str],
    min_strong: usize,
    min_avg_feeling: Option<f64>,
}

const RULES: &[AdvanceRule] = &[
    AdvanceRule {
        from: "learning", to: "practicing",
        window: 3, strong: &["full", "performance"], min_strong: 2, min_avg_feeling: None,
    },
    AdvanceRule {
        from: "practicing", to: "mastered",
        window: 7, strong: &["performance"], min_strong: 5, min_avg_feeling: Some(4.0),
    },
];

impl AdvanceRule {
    fn is_met(&self, recent: &[(String, Option<i64>)]) -> bool {
        if recent.len() < self.window {
            return false;
        }
        let strong = recent.iter().filter(|(t, _)| self.strong.contains(&t.as_str())).count();
        let rated: Vec<i64> = recent.iter().filter_map(|(_, f)| *f).collect();
        let avg = if rated.is_empty() { 0.0 } else { rated.iter().sum::<i64>() as f64 / rated.len() as f64 };
        strong >= self.min_strong && self.min_avg_feeling.is_none_or(|min| avg >= min)
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
    let recent: Vec<(String, Option<i64>)> = query_all(
        conn,
        "SELECT practice_type, feeling FROM sessions
         WHERE song_id = ?1 AND practice_type IS NOT NULL
         ORDER BY started_at DESC LIMIT ?2",
        params![song_id, rule.window as i64],
        |r| Ok((r.get(0)?, r.get(1)?)),
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
        let recent = |items: &[(&str, Option<i64>)]| -> Vec<(String, Option<i64>)> {
            items.iter().map(|(t, f)| (t.to_string(), *f)).collect()
        };
        let [learning, practicing] = [&RULES[0], &RULES[1]];
        assert!(learning.is_met(&recent(&[("full", None), ("section", None), ("performance", None)])));
        assert!(!learning.is_met(&recent(&[("full", None), ("section", None), ("first", None)])));
        assert!(!learning.is_met(&recent(&[("full", None), ("full", None)])));
        let perf = |f| ("performance", Some(f));
        assert!(practicing.is_met(&recent(&[perf(4), perf(4), perf(4), perf(4), perf(4), ("full", None), ("full", None)])));
        assert!(!practicing.is_met(&recent(&[perf(3), perf(3), perf(4), perf(4), perf(4), ("full", None), ("full", None)])));
    }

    #[test]
    fn mastery_changes_are_recorded() {
        let db = test_db();
        let song_id = db.create_song(&NewSong {
            title: "Nuvole Bianche", artist: Some("Ludovico Einaudi"), genre: None, album: None,
            year: None, cover_url: None, itunes_track_id: None, difficulty: None,
        }).unwrap();
        let mut suggestion = None;
        for (i, kind) in ["full", "section", "performance"].iter().enumerate() {
            let start = i as i64 * 100_000;
            let s = db.insert_session("2026-10-01", start, start + 60_000).unwrap();
            suggestion = db.tag_session(s, Some(song_id), Some(4), Some(kind), None).unwrap();
        }
        let suggestion = suggestion.expect("three sessions with two strong runs suggest advancing");
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
            (Some("learning".into()), "practicing".into(), Some(3)),
        ]);
    }
}
