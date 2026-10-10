//! Practice statistics: daily totals, streaks, insights and goals.

use std::collections::{HashMap, HashSet};
use chrono::{Duration, Local, NaiveDate, TimeZone, Timelike};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use super::{query_all, Database, Result};
use crate::time::{day_key, today};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyTotal {
    pub date: String,
    pub total_seconds: i64,
    pub session_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoalsConfig {
    pub daily_minutes: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreakInfo {
    pub current_streak: i32,
    pub best_streak: i32,
    pub last_played_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightsData {
    pub total_seconds_alltime: i64,
    pub total_sessions: i64,
    pub avg_session_seconds: i64,
    pub longest_session_seconds: i64,
    pub best_day_seconds: i64,
    pub best_day_date: Option<String>,
    pub morning_seconds: i64,
    pub afternoon_seconds: i64,
    pub evening_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayGoalStatus {
    pub date: String,
    pub minutes: i32,
    pub goal_met: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoalsStatus {
    pub config: GoalsConfig,
    pub today_seconds: i64,
    pub past_week_days: Vec<DayGoalStatus>,
}

const DEFAULT_DAILY_MINUTES: i32 = 30;

/// Totals for each of the last `days` days, oldest first, including empty days.
fn daily_totals(conn: &Connection, days: i32) -> Result<Vec<DailyTotal>> {
    let today = today();
    let start = today - Duration::days(days as i64 - 1);
    let by_day: HashMap<String, (i64, i32)> = query_all(
        conn,
        "SELECT practice_date, SUM(duration_seconds), COUNT(*) FROM sessions
         WHERE practice_date >= ?1 AND practice_date <= ?2 GROUP BY practice_date",
        params![day_key(start), day_key(today)],
        |r| Ok((r.get(0)?, (r.get(1)?, r.get(2)?))),
    )?.into_iter().collect();

    Ok((0..days as i64).map(|i| {
        let date = day_key(start + Duration::days(i));
        let (total_seconds, session_count) = by_day.get(&date).copied().unwrap_or((0, 0));
        DailyTotal { date, total_seconds, session_count }
    }).collect())
}

fn daily_goal_minutes(conn: &Connection) -> i32 {
    conn.query_row("SELECT target_minutes FROM goals WHERE goal_type = 'daily'", [], |r| r.get(0))
        .unwrap_or(DEFAULT_DAILY_MINUTES)
}

/// Every day with at least one session, most recent first.
fn practice_days(conn: &Connection) -> Result<Vec<String>> {
    query_all(conn, "SELECT DISTINCT practice_date FROM sessions ORDER BY practice_date DESC", [], |r| r.get(0))
}

/// Current and best streak of consecutive practice days. The current streak
/// still counts when today has no session yet but yesterday has.
pub(super) fn streaks(days: &[String], today: NaiveDate) -> (i32, i32) {
    let played: HashSet<NaiveDate> = days.iter()
        .filter_map(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .collect();

    let mut day = if played.contains(&today) { today } else { today - Duration::days(1) };
    let mut current = 0;
    while played.contains(&day) {
        current += 1;
        day -= Duration::days(1);
    }

    let mut sorted: Vec<NaiveDate> = played.into_iter().collect();
    sorted.sort();
    let (mut best, mut run) = (0, 0);
    for (i, d) in sorted.iter().enumerate() {
        run = if i > 0 && *d == sorted[i - 1] + Duration::days(1) { run + 1 } else { 1 };
        best = best.max(run);
    }
    (current, best.max(current))
}

pub(super) fn current_streak(conn: &Connection) -> Result<i32> {
    Ok(streaks(&practice_days(conn)?, today()).0)
}

impl Database {
    pub fn get_daily_totals(&self, days: i32) -> Result<Vec<DailyTotal>> {
        daily_totals(&self.conn(), days)
    }

    pub fn get_goals(&self) -> Result<GoalsConfig> {
        Ok(GoalsConfig { daily_minutes: daily_goal_minutes(&self.conn()) })
    }

    pub fn set_goal(&self, goal_type: &str, minutes: i32) -> Result<()> {
        self.conn().execute(
            "INSERT OR REPLACE INTO goals (goal_type, target_minutes) VALUES (?1, ?2)",
            params![goal_type, minutes],
        )?;
        Ok(())
    }

    pub fn get_streak(&self) -> Result<StreakInfo> {
        let days = practice_days(&self.conn())?;
        let (current_streak, best_streak) = streaks(&days, today());
        Ok(StreakInfo { current_streak, best_streak, last_played_date: days.first().cloned() })
    }

    pub fn get_insights(&self) -> Result<InsightsData> {
        let conn = self.conn();
        let (total_seconds_alltime, total_sessions, longest_session_seconds): (i64, i64, i64) = conn.query_row(
            "SELECT COALESCE(SUM(duration_seconds), 0), COUNT(*), COALESCE(MAX(duration_seconds), 0) FROM sessions",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        let avg_session_seconds = if total_sessions > 0 { total_seconds_alltime / total_sessions } else { 0 };

        let (best_day_seconds, best_day_date): (i64, Option<String>) = conn.query_row(
            "SELECT SUM(duration_seconds), practice_date FROM sessions
             GROUP BY practice_date ORDER BY SUM(duration_seconds) DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap_or((0, None));

        let (mut morning_seconds, mut afternoon_seconds, mut evening_seconds) = (0, 0, 0);
        let sessions: Vec<(i64, i64)> = query_all(
            &conn, "SELECT started_at, duration_seconds FROM sessions", [], |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        for (started_at, seconds) in sessions {
            let Some(start) = Local.timestamp_millis_opt(started_at).single() else { continue };
            match start.hour() {
                5..=11 => morning_seconds += seconds,
                12..=16 => afternoon_seconds += seconds,
                17.. => evening_seconds += seconds,
                _ => {}
            }
        }

        Ok(InsightsData {
            total_seconds_alltime,
            total_sessions,
            avg_session_seconds,
            longest_session_seconds,
            best_day_seconds,
            best_day_date,
            morning_seconds,
            afternoon_seconds,
            evening_seconds,
        })
    }

    pub fn get_goals_status(&self) -> Result<GoalsStatus> {
        let conn = self.conn();
        let config = GoalsConfig { daily_minutes: daily_goal_minutes(&conn) };
        let goal_seconds = config.daily_minutes as i64 * 60;
        let week = daily_totals(&conn, 7)?;
        let today_seconds = week.last().map_or(0, |d| d.total_seconds);
        let past_week_days = week.into_iter().map(|d| DayGoalStatus {
            minutes: (d.total_seconds / 60) as i32,
            goal_met: d.total_seconds >= goal_seconds,
            date: d.date,
        }).collect();
        Ok(GoalsStatus { config, today_seconds, past_week_days })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_current_and_best_streaks() {
        let today = NaiveDate::from_ymd_opt(2026, 10, 10).unwrap();
        let days = |ds: &[&str]| ds.iter().map(|d| d.to_string()).collect::<Vec<_>>();
        // Played today and the two days before; a 4-day run earlier.
        let played = days(&["2026-10-10", "2026-10-09", "2026-10-08", "2026-10-01",
                            "2026-09-30", "2026-09-29", "2026-09-28"]);
        assert_eq!(streaks(&played, today), (3, 4));
        // Not yet played today: yesterday's streak still counts.
        assert_eq!(streaks(&days(&["2026-10-09", "2026-10-08"]), today), (2, 2));
        // Last played two days ago: streak broken.
        assert_eq!(streaks(&days(&["2026-10-08"]), today), (0, 1));
        assert_eq!(streaks(&[], today), (0, 0));
    }
}
