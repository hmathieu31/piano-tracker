//! Achievements: their definitions, and unlocking them after each session.

use std::collections::HashMap;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use super::{query_all, stats, Database, Result, SessionRecord};
use crate::time::now_ms;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AchievementInfo {
    pub key: String,
    pub title: String,
    pub description: String,
    pub icon: String,
    pub unlocked_at: Option<i64>,
}

/// What an achievement asks for.
enum Goal {
    Sessions(i64),
    StreakDays(i32),
    TotalSeconds(i64),
    SessionSeconds(i64),
}

struct Achievement {
    key: &'static str,
    title: &'static str,
    description: &'static str,
    icon: &'static str,
    goal: Goal,
}

const HOUR: i64 = 3600;

const ACHIEVEMENTS: &[Achievement] = &[
    Achievement { key: "first_session", title: "First Note", description: "Complete your first session", icon: "🎵", goal: Goal::Sessions(1) },
    Achievement { key: "streak_3", title: "Hat Trick", description: "3-day streak", icon: "🎩", goal: Goal::StreakDays(3) },
    Achievement { key: "streak_7", title: "Week Warrior", description: "7-day streak", icon: "⚔️", goal: Goal::StreakDays(7) },
    Achievement { key: "streak_30", title: "Month Master", description: "30-day streak", icon: "🏆", goal: Goal::StreakDays(30) },
    Achievement { key: "streak_100", title: "Centurion", description: "100-day streak", icon: "💯", goal: Goal::StreakDays(100) },
    Achievement { key: "total_1h", title: "First Hour", description: "1 hour total practice", icon: "⏱️", goal: Goal::TotalSeconds(HOUR) },
    Achievement { key: "total_10h", title: "Ten Hours In", description: "10 hours total practice", icon: "🕙", goal: Goal::TotalSeconds(10 * HOUR) },
    Achievement { key: "total_50h", title: "Fifty Hours", description: "50 hours total practice", icon: "🌟", goal: Goal::TotalSeconds(50 * HOUR) },
    Achievement { key: "total_100h", title: "Century Club", description: "100 hours total practice", icon: "👑", goal: Goal::TotalSeconds(100 * HOUR) },
    Achievement { key: "session_30m", title: "Half Hour Hero", description: "Single session ≥ 30 minutes", icon: "🦸", goal: Goal::SessionSeconds(HOUR / 2) },
    Achievement { key: "session_1h", title: "Marathon Session", description: "Single session ≥ 60 minutes", icon: "🏃", goal: Goal::SessionSeconds(HOUR) },
    Achievement { key: "session_2h", title: "Piano Legend", description: "Single session ≥ 120 minutes", icon: "🎹", goal: Goal::SessionSeconds(2 * HOUR) },
];

impl Database {
    /// Unlock every achievement reached once `session` is saved. Returns the
    /// keys unlocked by this call.
    pub fn check_and_unlock_achievements(&self, session: &SessionRecord) -> Result<Vec<String>> {
        self.transaction(|tx| {
            let (total_sessions, total_seconds): (i64, i64) = tx.query_row(
                "SELECT COUNT(*), COALESCE(SUM(duration_seconds), 0) FROM sessions", [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            let streak = stats::current_streak(tx)?;
            let now = now_ms();

            let mut unlocked = Vec::new();
            for a in ACHIEVEMENTS {
                let reached = match a.goal {
                    Goal::Sessions(n) => total_sessions >= n,
                    Goal::StreakDays(n) => streak >= n,
                    Goal::TotalSeconds(n) => total_seconds >= n,
                    Goal::SessionSeconds(n) => session.duration_seconds >= n,
                };
                if reached && tx.execute(
                    "INSERT OR IGNORE INTO achievements (key, unlocked_at, session_id) VALUES (?1, ?2, ?3)",
                    params![a.key, now, session.id],
                )? > 0 {
                    unlocked.push(a.key.to_string());
                }
            }
            Ok(unlocked)
        })
    }

    pub fn get_all_achievements(&self) -> Result<Vec<AchievementInfo>> {
        let unlocked: HashMap<String, i64> = query_all(
            &self.conn(), "SELECT key, unlocked_at FROM achievements", [], |r| Ok((r.get(0)?, r.get(1)?)),
        )?.into_iter().collect();
        Ok(ACHIEVEMENTS.iter().map(|a| AchievementInfo {
            key: a.key.to_string(),
            title: a.title.to_string(),
            description: a.description.to_string(),
            icon: a.icon.to_string(),
            unlocked_at: unlocked.get(a.key).copied(),
        }).collect())
    }
}

#[cfg(test)]
mod tests {
    use crate::db::test_db;

    #[test]
    fn unlocks_each_achievement_once() {
        let db = test_db();
        let today = crate::time::day_key(crate::time::today());
        let id = db.insert_session(&today, 0, 31 * 60 * 1000).unwrap();
        let session = db.get_session(id).unwrap().unwrap();
        assert_eq!(db.check_and_unlock_achievements(&session).unwrap(), vec!["first_session", "session_30m"]);
        assert!(db.check_and_unlock_achievements(&session).unwrap().is_empty());
        let all = db.get_all_achievements().unwrap();
        assert_eq!(all.iter().filter(|a| a.unlocked_at.is_some()).count(), 2);
    }
}
