use std::sync::Mutex;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongRecord {
    pub id: i64,
    pub title: String,
    pub artist: Option<String>,
    pub genre: Option<String>,
    pub album: Option<String>,
    pub year: Option<i32>,
    pub cover_url: Option<String>,
    pub spotify_url: Option<String>,
    pub musicbrainz_recording_id: Option<String>,
    pub musicbrainz_release_id: Option<String>,
    pub created_at: i64,
    // Aggregated stats — populated by get_song_stats / get_recent_songs, None otherwise
    pub total_seconds: Option<i64>,
    pub session_count: Option<i32>,
    pub last_played_date: Option<String>,
    // Learning journey fields
    pub avg_feeling: Option<f64>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongDetail {
    pub song: SongRecord,
    pub sessions: Vec<SessionRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiEventRecord {
    pub relative_ms: i64,
    pub note: u8,
    pub velocity: u8,
    pub channel: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: i64,
    pub date: String,
    pub start_ts: i64,
    pub end_ts: i64,
    pub duration_seconds: i64,
    pub note: Option<String>,
    pub song_id: Option<i64>,
    pub song_name: Option<String>,
    pub feeling: Option<i64>,
    pub practice_type: Option<String>,
    pub song: Option<SongRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MasterySuggestion {
    pub song_id: i64,
    pub song_title: String,
    pub current_status: String,
    pub suggested_status: String,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AchievementInfo {
    pub key: String,
    pub title: String,
    pub description: String,
    pub icon: String,
    pub unlocked_at: Option<i64>,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &std::path::Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        Ok(Database { conn: Mutex::new(conn) })
    }

    pub fn init(&self) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch("
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
            CREATE TABLE IF NOT EXISTS achievements (
                key TEXT PRIMARY KEY,
                unlocked_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS songs (
                id                         INTEGER PRIMARY KEY AUTOINCREMENT,
                title                      TEXT NOT NULL,
                artist                     TEXT,
                genre                      TEXT,
                album                      TEXT,
                year                       INTEGER,
                cover_url                  TEXT,
                spotify_url                TEXT,
                musicbrainz_recording_id   TEXT,
                musicbrainz_release_id     TEXT,
                created_at                 INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
            CREATE TABLE IF NOT EXISTS midi_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                relative_ms INTEGER NOT NULL,
                note        INTEGER NOT NULL,
                velocity    INTEGER NOT NULL,
                channel     INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_midi_events_session ON midi_events(session_id);
            INSERT OR IGNORE INTO goals (goal_type, target_minutes) VALUES ('daily', 30);
        ")?;
        // Migrate existing sessions table to add song columns if not present
        let _ = conn.execute("ALTER TABLE sessions ADD COLUMN song_id INTEGER REFERENCES songs(id)", []);
        let _ = conn.execute("ALTER TABLE sessions ADD COLUMN song_name TEXT", []);
        let _ = conn.execute("ALTER TABLE sessions ADD COLUMN feeling INTEGER", []);
        let _ = conn.execute("ALTER TABLE sessions ADD COLUMN practice_type TEXT", []);
        let _ = conn.execute("ALTER TABLE songs ADD COLUMN status TEXT DEFAULT 'learning'", []);
        // Clean up any pre-existing orphan songs (songs with no sessions)
        let _ = conn.execute(
            "DELETE FROM songs WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE song_id = songs.id)",
            [],
        );
        Ok(())
    }

    pub fn insert_session(&self, date: &str, start_ts: i64, end_ts: i64, duration_seconds: i64) -> Result<i64, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO sessions (date, start_ts, end_ts, duration_seconds) VALUES (?1, ?2, ?3, ?4)",
            params![date, start_ts, end_ts, duration_seconds],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn update_session_note(&self, id: i64, note: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE sessions SET note = ?1 WHERE id = ?2", params![note, id])?;
        Ok(())
    }

    fn row_to_session(row: &rusqlite::Row) -> rusqlite::Result<SessionRecord> {
        let song_id: Option<i64> = row.get(6)?;
        let song = if let Some(id) = song_id {
            let sg_title: Option<String> = row.get(11)?;
            sg_title.map(|title| SongRecord {
                id,
                title,
                artist: row.get(12).ok().flatten(),
                genre: row.get(13).ok().flatten(),
                album: row.get(14).ok().flatten(),
                year: row.get(15).ok().flatten(),
                cover_url: row.get(16).ok().flatten(),
                spotify_url: row.get(17).ok().flatten(),
                musicbrainz_recording_id: row.get(18).ok().flatten(),
                musicbrainz_release_id: row.get(19).ok().flatten(),
                created_at: row.get(20).unwrap_or(0),
                total_seconds: None,
                session_count: None,
                last_played_date: None,
                avg_feeling: None,
                status: row.get(21).ok().flatten(),
            })
        } else {
            None
        };
        Ok(SessionRecord {
            id: row.get(0)?,
            date: row.get(1)?,
            start_ts: row.get(2)?,
            end_ts: row.get(3)?,
            duration_seconds: row.get(4)?,
            note: row.get(5)?,
            song_id: row.get(6)?,
            song_name: row.get(7)?,
            feeling: row.get(8)?,
            practice_type: row.get(9)?,
            song,
        })
    }

    pub fn get_sessions(&self, limit: i32) -> Result<Vec<SessionRecord>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.date, s.start_ts, s.end_ts, s.duration_seconds, s.note,
                    s.song_id, s.song_name, s.feeling, s.practice_type,
                    sg.id, sg.title, sg.artist, sg.genre, sg.album, sg.year,
                    sg.cover_url, sg.spotify_url, sg.musicbrainz_recording_id,
                    sg.musicbrainz_release_id, sg.created_at, sg.status
             FROM sessions s
             LEFT JOIN songs sg ON s.song_id = sg.id
             ORDER BY s.start_ts DESC LIMIT ?1"
        )?;
        let rows = stmt.query_map(params![limit], Self::row_to_session)?;
        rows.collect()
    }

    pub fn get_sessions_for_song(&self, song_id: i64) -> Result<Vec<SessionRecord>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.date, s.start_ts, s.end_ts, s.duration_seconds, s.note,
                    s.song_id, s.song_name, s.feeling, s.practice_type,
                    sg.id, sg.title, sg.artist, sg.genre, sg.album, sg.year,
                    sg.cover_url, sg.spotify_url, sg.musicbrainz_recording_id,
                    sg.musicbrainz_release_id, sg.created_at, sg.status
             FROM sessions s
             LEFT JOIN songs sg ON s.song_id = sg.id
             WHERE s.song_id = ?1
             ORDER BY s.start_ts DESC"
        )?;
        let rows = stmt.query_map(params![song_id], Self::row_to_session)?;
        rows.collect()
    }

    pub fn get_daily_totals(&self, days: i32) -> Result<Vec<DailyTotal>, rusqlite::Error> {
        use chrono::{Local, Duration, NaiveDate};

        let conn = self.conn.lock().unwrap();
        let today = Local::now().date_naive();

        let start_date = today - Duration::days((days - 1) as i64);
        let start_str = start_date.format("%Y-%m-%d").to_string();
        let today_str = today.format("%Y-%m-%d").to_string();

        let mut stmt = conn.prepare(
            "SELECT date, SUM(duration_seconds), COUNT(*) FROM sessions WHERE date >= ?1 AND date <= ?2 GROUP BY date"
        )?;

        use std::collections::HashMap;
        let mut map: HashMap<String, (i64, i32)> = HashMap::new();
        let rows = stmt.query_map(params![start_str, today_str], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, i32>(2)?))
        })?;
        for row in rows {
            let (date, total, count) = row?;
            map.insert(date, (total, count));
        }

        let mut result = Vec::with_capacity(days as usize);
        for i in 0..days {
            let date: NaiveDate = start_date + Duration::days(i as i64);
            let date_str = date.format("%Y-%m-%d").to_string();
            let (total_seconds, session_count) = map.get(&date_str).copied().unwrap_or((0, 0));
            result.push(DailyTotal { date: date_str, total_seconds, session_count });
        }
        Ok(result)
    }

    pub fn get_goals(&self) -> Result<GoalsConfig, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let daily: i32 = conn.query_row(
            "SELECT target_minutes FROM goals WHERE goal_type = 'daily'", [], |r| r.get(0)
        ).unwrap_or(30);
        Ok(GoalsConfig { daily_minutes: daily })
    }

    pub fn set_goal(&self, goal_type: &str, minutes: i32) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO goals (goal_type, target_minutes) VALUES (?1, ?2)",
            params![goal_type, minutes],
        )?;
        Ok(())
    }

    pub fn get_streak(&self) -> Result<StreakInfo, rusqlite::Error> {
        use chrono::{Local, Duration, NaiveDate};

        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT DISTINCT date FROM sessions ORDER BY date DESC"
        )?;
        let dates: Vec<String> = stmt.query_map([], |row| row.get(0))?.filter_map(|r| r.ok()).collect();

        let last_played_date = dates.first().cloned();
        let today = Local::now().date_naive();

        let date_set: std::collections::HashSet<String> = dates.iter().cloned().collect();

        let mut current_streak = 0i32;
        let mut check_date = today;

        if date_set.contains(&today.format("%Y-%m-%d").to_string()) {
            loop {
                let s = check_date.format("%Y-%m-%d").to_string();
                if date_set.contains(&s) {
                    current_streak += 1;
                    check_date = check_date - Duration::days(1);
                } else {
                    break;
                }
            }
        } else {
            check_date = today - Duration::days(1);
            if date_set.contains(&check_date.format("%Y-%m-%d").to_string()) {
                loop {
                    let s = check_date.format("%Y-%m-%d").to_string();
                    if date_set.contains(&s) {
                        current_streak += 1;
                        check_date = check_date - Duration::days(1);
                    } else {
                        break;
                    }
                }
            }
        }

        let mut best_streak = 0i32;
        let mut run = 0i32;

        let mut asc_dates: Vec<NaiveDate> = dates.iter()
            .filter_map(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
            .collect();
        asc_dates.sort();
        asc_dates.dedup();

        let mut prev: Option<NaiveDate> = None;
        for d in &asc_dates {
            if let Some(p) = prev {
                if *d == p + Duration::days(1) {
                    run += 1;
                } else {
                    run = 1;
                }
            } else {
                run = 1;
            }
            if run > best_streak { best_streak = run; }
            prev = Some(*d);
        }

        if current_streak > best_streak { best_streak = current_streak; }

        Ok(StreakInfo { current_streak, best_streak, last_played_date })
    }

    pub fn get_insights(&self) -> Result<InsightsData, rusqlite::Error> {
        use chrono::{TimeZone, Local, Timelike};

        let conn = self.conn.lock().unwrap();

        let total_seconds_alltime: i64 = conn.query_row(
            "SELECT COALESCE(SUM(duration_seconds), 0) FROM sessions", [], |r| r.get(0)
        ).unwrap_or(0);

        let total_sessions: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sessions", [], |r| r.get(0)
        ).unwrap_or(0);

        let avg_session_seconds = if total_sessions > 0 { total_seconds_alltime / total_sessions } else { 0 };

        let longest_session_seconds: i64 = conn.query_row(
            "SELECT COALESCE(MAX(duration_seconds), 0) FROM sessions", [], |r| r.get(0)
        ).unwrap_or(0);

        let best_day: (i64, Option<String>) = conn.query_row(
            "SELECT COALESCE(SUM(duration_seconds), 0), date FROM sessions GROUP BY date ORDER BY SUM(duration_seconds) DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?))
        ).unwrap_or((0, None));

        let mut stmt = conn.prepare(
            "SELECT start_ts, duration_seconds FROM sessions"
        )?;
        let sessions: Vec<(i64, i64)> = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })?.filter_map(|r| r.ok()).collect();

        let mut morning_seconds = 0i64;
        let mut afternoon_seconds = 0i64;
        let mut evening_seconds = 0i64;

        for (start_ts_ms, dur) in &sessions {
            let dt = Local.timestamp_millis_opt(*start_ts_ms).single();
            if let Some(dt) = dt {
                let h = dt.hour();
                if h >= 5 && h < 12 {
                    morning_seconds += dur;
                } else if h >= 12 && h < 17 {
                    afternoon_seconds += dur;
                } else if h >= 17 {
                    evening_seconds += dur;
                }
            }
        }

        Ok(InsightsData {
            total_seconds_alltime,
            total_sessions,
            avg_session_seconds,
            longest_session_seconds,
            best_day_seconds: best_day.0,
            best_day_date: best_day.1,
            morning_seconds,
            afternoon_seconds,
            evening_seconds,
        })
    }

    pub fn get_goals_status(&self) -> Result<GoalsStatus, rusqlite::Error> {
        use chrono::{Local, Duration};

        let today = Local::now().date_naive();
        let today_str = today.format("%Y-%m-%d").to_string();

        let config = {
            let conn = self.conn.lock().unwrap();
            let daily: i32 = conn.query_row(
                "SELECT target_minutes FROM goals WHERE goal_type = 'daily'", [], |r| r.get(0)
            ).unwrap_or(30);
            GoalsConfig { daily_minutes: daily }
        };

        let conn = self.conn.lock().unwrap();

        let today_seconds: i64 = conn.query_row(
            "SELECT COALESCE(SUM(duration_seconds), 0) FROM sessions WHERE date = ?1",
            params![today_str], |r| r.get(0)
        ).unwrap_or(0);

        let daily_goal_seconds = config.daily_minutes as i64 * 60;
        let mut past_week_days = Vec::new();
        for i in (0..7i64).rev() {
            let d = today - Duration::days(i);
            let d_str = d.format("%Y-%m-%d").to_string();
            let secs: i64 = conn.query_row(
                "SELECT COALESCE(SUM(duration_seconds), 0) FROM sessions WHERE date = ?1",
                params![d_str], |r| r.get(0)
            ).unwrap_or(0);
            past_week_days.push(DayGoalStatus {
                date: d_str,
                minutes: (secs / 60) as i32,
                goal_met: secs >= daily_goal_seconds,
            });
        }

        Ok(GoalsStatus { config, today_seconds, past_week_days })
    }

    pub fn check_and_unlock_achievements(&self, session: &SessionRecord) -> Result<Vec<String>, rusqlite::Error> {
        use chrono::{Local, Duration};

        let conn = self.conn.lock().unwrap();

        let total_sessions: i64 = conn.query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0)).unwrap_or(0);
        let total_seconds: i64 = conn.query_row("SELECT COALESCE(SUM(duration_seconds), 0) FROM sessions", [], |r| r.get(0)).unwrap_or(0);

        let mut streak_stmt = conn.prepare("SELECT DISTINCT date FROM sessions ORDER BY date DESC")?;
        let dates: Vec<String> = streak_stmt.query_map([], |row| row.get(0))?.filter_map(|r| r.ok()).collect();

        let today = Local::now().date_naive();
        let date_set: std::collections::HashSet<String> = dates.iter().cloned().collect();
        let mut current_streak = 0i32;
        let mut check_date = today;
        if date_set.contains(&today.format("%Y-%m-%d").to_string()) {
            loop {
                let s = check_date.format("%Y-%m-%d").to_string();
                if date_set.contains(&s) { current_streak += 1; check_date = check_date - Duration::days(1); } else { break; }
            }
        } else {
            check_date = today - Duration::days(1);
            if date_set.contains(&check_date.format("%Y-%m-%d").to_string()) {
                loop {
                    let s = check_date.format("%Y-%m-%d").to_string();
                    if date_set.contains(&s) { current_streak += 1; check_date = check_date - Duration::days(1); } else { break; }
                }
            }
        }

        let session_duration = session.duration_seconds;

        let achievements: Vec<(&str, bool)> = vec![
            ("first_session", total_sessions >= 1),
            ("streak_3", current_streak >= 3),
            ("streak_7", current_streak >= 7),
            ("streak_30", current_streak >= 30),
            ("streak_100", current_streak >= 100),
            ("total_1h", total_seconds >= 3600),
            ("total_10h", total_seconds >= 36000),
            ("total_50h", total_seconds >= 180000),
            ("total_100h", total_seconds >= 360000),
            ("session_30m", session_duration >= 1800),
            ("session_1h", session_duration >= 3600),
            ("session_2h", session_duration >= 7200),
        ];

        use std::time::{SystemTime, UNIX_EPOCH};
        let now_ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;

        let mut newly_unlocked = Vec::new();
        for (key, condition) in &achievements {
            if *condition {
                let result = conn.execute(
                    "INSERT OR IGNORE INTO achievements (key, unlocked_at) VALUES (?1, ?2)",
                    params![key, now_ts],
                );
                if let Ok(rows) = result {
                    if rows > 0 {
                        newly_unlocked.push(key.to_string());
                    }
                }
            }
        }

        Ok(newly_unlocked)
    }

    pub fn get_all_achievements(&self) -> Result<Vec<AchievementInfo>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();

        let all_achievements = vec![
            ("first_session", "First Note", "Complete your first session", "🎵"),
            ("streak_3", "Hat Trick", "3-day streak", "🎩"),
            ("streak_7", "Week Warrior", "7-day streak", "⚔️"),
            ("streak_30", "Month Master", "30-day streak", "🏆"),
            ("streak_100", "Centurion", "100-day streak", "💯"),
            ("total_1h", "First Hour", "1 hour total practice", "⏱️"),
            ("total_10h", "Ten Hours In", "10 hours total practice", "🕙"),
            ("total_50h", "Fifty Hours", "50 hours total practice", "🌟"),
            ("total_100h", "Century Club", "100 hours total practice", "👑"),
            ("session_30m", "Half Hour Hero", "Single session ≥ 30 minutes", "🦸"),
            ("session_1h", "Marathon Session", "Single session ≥ 60 minutes", "🏃"),
            ("session_2h", "Piano Legend", "Single session ≥ 120 minutes", "🎹"),
        ];

        let mut stmt = conn.prepare("SELECT key, unlocked_at FROM achievements")?;
        let unlocked: std::collections::HashMap<String, i64> = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?.filter_map(|r| r.ok()).collect();

        let result = all_achievements.iter().map(|(key, title, desc, icon)| {
            AchievementInfo {
                key: key.to_string(),
                title: title.to_string(),
                description: desc.to_string(),
                icon: icon.to_string(),
                unlocked_at: unlocked.get(*key).copied(),
            }
        }).collect();

        Ok(result)
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let result = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0)
        );
        match result {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    // ── Song management ─────────────────────────────────────────────────────

    pub fn create_song(
        &self,
        title: &str,
        artist: Option<&str>,
        genre: Option<&str>,
        album: Option<&str>,
        year: Option<i32>,
        cover_url: Option<&str>,
        spotify_url: Option<&str>,
        mb_recording_id: Option<&str>,
        mb_release_id: Option<&str>,
    ) -> Result<i64, rusqlite::Error> {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO songs (title, artist, genre, album, year, cover_url, spotify_url,
                               musicbrainz_recording_id, musicbrainz_release_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![title, artist, genre, album, year, cover_url, spotify_url,
                    mb_recording_id, mb_release_id, now],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn update_song_genre(&self, song_id: i64, genre: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE songs SET genre = ?1 WHERE id = ?2", params![genre, song_id])?;
        Ok(())
    }

    fn row_to_song_stats(row: &rusqlite::Row) -> rusqlite::Result<SongRecord> {
        Ok(SongRecord {
            id: row.get(0)?,
            title: row.get(1)?,
            artist: row.get(2)?,
            genre: row.get(3)?,
            album: row.get(4)?,
            year: row.get(5)?,
            cover_url: row.get(6)?,
            spotify_url: row.get(7)?,
            musicbrainz_recording_id: row.get(8)?,
            musicbrainz_release_id: row.get(9)?,
            created_at: row.get(10)?,
            total_seconds: row.get(11).ok(),
            session_count: row.get(12).ok(),
            last_played_date: row.get(13).ok().flatten(),
            avg_feeling: row.get(14).ok().flatten(),
            status: row.get(15).ok().flatten(),
        })
    }

    pub fn get_songs(&self) -> Result<Vec<SongRecord>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, artist, genre, album, year, cover_url, spotify_url,
                    musicbrainz_recording_id, musicbrainz_release_id, created_at,
                    NULL, NULL, NULL, NULL, status
             FROM songs ORDER BY title ASC"
        )?;
        let rows = stmt.query_map([], Self::row_to_song_stats)?;
        rows.collect()
    }

    pub fn get_song_stats(&self) -> Result<Vec<SongRecord>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT sg.id, sg.title, sg.artist, sg.genre, sg.album, sg.year,
                    sg.cover_url, sg.spotify_url,
                    sg.musicbrainz_recording_id, sg.musicbrainz_release_id, sg.created_at,
                    COALESCE(SUM(s.duration_seconds), 0) as total_seconds,
                    COUNT(s.id) as session_count,
                    MAX(s.date) as last_played_date,
                    AVG(s.feeling) as avg_feeling,
                    sg.status
             FROM songs sg
             INNER JOIN sessions s ON s.song_id = sg.id
             GROUP BY sg.id
             ORDER BY total_seconds DESC"
        )?;
        let rows = stmt.query_map([], Self::row_to_song_stats)?;
        rows.collect()
    }

    pub fn get_recent_songs(&self, limit: i32) -> Result<Vec<SongRecord>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT sg.id, sg.title, sg.artist, sg.genre, sg.album, sg.year,
                    sg.cover_url, sg.spotify_url,
                    sg.musicbrainz_recording_id, sg.musicbrainz_release_id, sg.created_at,
                    COALESCE(SUM(s.duration_seconds), 0) as total_seconds,
                    COUNT(s.id) as session_count,
                    MAX(s.date) as last_played_date,
                    AVG(s.feeling) as avg_feeling,
                    sg.status
             FROM songs sg
             INNER JOIN sessions s ON s.song_id = sg.id
             GROUP BY sg.id
             ORDER BY MAX(s.start_ts) DESC
             LIMIT ?1"
        )?;
        let rows = stmt.query_map(params![limit], Self::row_to_song_stats)?;
        rows.collect()
    }

    // ── Session-Song linking ─────────────────────────────────────────────────

    /// Delete a song that has no sessions remaining. Safe to call speculatively.
    fn delete_if_orphan(conn: &rusqlite::Connection, song_id: i64) -> Result<(), rusqlite::Error> {
        conn.execute(
            "DELETE FROM songs WHERE id = ?1
             AND NOT EXISTS (SELECT 1 FROM sessions WHERE song_id = ?1)",
            params![song_id],
        )?;
        Ok(())
    }

    pub fn link_session_song(&self, session_id: i64, song_id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        // Capture the song that is being displaced (if any)
        let old_song_id: Option<i64> = conn.query_row(
            "SELECT song_id FROM sessions WHERE id = ?1",
            params![session_id],
            |row| row.get(0),
        ).ok().flatten();

        conn.execute(
            "UPDATE sessions SET song_id = ?1 WHERE id = ?2",
            params![song_id, session_id],
        )?;

        // If we replaced a different song, clean it up if it is now orphaned
        if let Some(old_id) = old_song_id {
            if old_id != song_id {
                Self::delete_if_orphan(&conn, old_id)?;
            }
        }
        Ok(())
    }

    pub fn unlink_session_song(&self, session_id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let song_id: Option<i64> = conn.query_row(
            "SELECT song_id FROM sessions WHERE id = ?1",
            params![session_id],
            |row| row.get(0),
        ).ok().flatten();

        conn.execute("UPDATE sessions SET song_id = NULL WHERE id = ?1", params![session_id])?;

        if let Some(id) = song_id {
            Self::delete_if_orphan(&conn, id)?;
        }
        Ok(())
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
    ) -> Result<Option<MasterySuggestion>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();

        // Capture old song so we can orphan-check it after reassignment
        let old_song_id: Option<i64> = conn.query_row(
            "SELECT song_id FROM sessions WHERE id = ?1",
            params![session_id],
            |row| row.get(0),
        ).ok().flatten();

        conn.execute(
            "UPDATE sessions SET song_id = ?1, feeling = ?2, practice_type = ?3,
                     note = CASE WHEN ?4 IS NOT NULL THEN ?4 ELSE note END
             WHERE id = ?5",
            params![song_id, feeling, practice_type, note, session_id],
        )?;

        if let Some(sid) = song_id {
            // Sync song_name onto the session row for display in History
            let title: Option<String> = conn.query_row(
                "SELECT title FROM songs WHERE id = ?1", params![sid], |r| r.get(0)
            ).ok();
            if let Some(t) = title {
                conn.execute(
                    "UPDATE sessions SET song_name = ?1 WHERE id = ?2",
                    params![t, session_id],
                )?;
            }
            // If we displaced a different song, remove it if now orphaned
            if let Some(old_id) = old_song_id {
                if old_id != sid {
                    Self::delete_if_orphan(&conn, old_id)?;
                }
            }
        } else if let Some(old_id) = old_song_id {
            // Song was removed — clear song_name too and orphan-check
            conn.execute("UPDATE sessions SET song_name = NULL WHERE id = ?1", params![session_id])?;
            Self::delete_if_orphan(&conn, old_id)?;
        }

        // Check if this song is ready to advance to the next mastery stage
        let suggestion = if let Some(sid) = song_id {
            Self::compute_mastery_suggestion_inner(&conn, sid)?
        } else {
            None
        };

        Ok(suggestion)
    }

    /// Advance a song's mastery status (called after user confirms the suggestion).
    pub fn confirm_mastery_advance(&self, song_id: i64, new_status: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE songs SET status = ?1 WHERE id = ?2",
            params![new_status, song_id],
        )?;
        Ok(())
    }

    fn compute_mastery_suggestion_inner(
        conn: &rusqlite::Connection,
        song_id: i64,
    ) -> Result<Option<MasterySuggestion>, rusqlite::Error> {
        let current: Option<String> = conn.query_row(
            "SELECT status FROM songs WHERE id = ?1",
            params![song_id],
            |row| row.get(0),
        ).ok().flatten();
        let title: String = conn.query_row(
            "SELECT title FROM songs WHERE id = ?1",
            params![song_id],
            |row| row.get(0),
        )?;
        let current_str = current.as_deref().unwrap_or("learning");

        match current_str {
            "learning" => {
                // Need ≥3 tagged sessions, of which ≥2 are 'full' or 'performance'
                let types: Vec<Option<String>> = {
                    let mut stmt = conn.prepare(
                        "SELECT practice_type FROM sessions WHERE song_id = ?1
                         AND practice_type IS NOT NULL
                         ORDER BY start_ts DESC LIMIT 3"
                    )?;
                    let collected: Vec<Option<String>> = stmt.query_map(params![song_id], |row| row.get(0))?.filter_map(|r| r.ok()).collect();
                    collected
                };
                if types.len() >= 3 {
                    let strong = types.iter().filter(|t| {
                        matches!(t.as_deref(), Some("full") | Some("performance"))
                    }).count();
                    if strong >= 2 {
                        return Ok(Some(MasterySuggestion {
                            song_id,
                            song_title: title,
                            current_status: "learning".to_string(),
                            suggested_status: "practicing".to_string(),
                        }));
                    }
                }
            }
            "practicing" => {
                // Need ≥7 tagged sessions, of which ≥5 are 'performance' AND avg mood ≥4
                let rows: Vec<(Option<String>, Option<i64>)> = {
                    let mut stmt = conn.prepare(
                        "SELECT practice_type, feeling FROM sessions WHERE song_id = ?1
                         AND practice_type IS NOT NULL
                         ORDER BY start_ts DESC LIMIT 7"
                    )?;
                    let collected: Vec<(Option<String>, Option<i64>)> = stmt.query_map(params![song_id], |row| {
                        Ok((row.get(0)?, row.get(1)?))
                    })?.filter_map(|r| r.ok()).collect();
                    collected
                };
                if rows.len() >= 7 {
                    let perf = rows.iter().filter(|(t, _)| t.as_deref() == Some("performance")).count();
                    let rated: Vec<i64> = rows.iter().filter_map(|(_, f)| *f).collect();
                    let avg = if rated.is_empty() { 0.0 } else {
                        rated.iter().sum::<i64>() as f64 / rated.len() as f64
                    };
                    if perf >= 5 && avg >= 4.0 {
                        return Ok(Some(MasterySuggestion {
                            song_id,
                            song_title: title,
                            current_status: "practicing".to_string(),
                            suggested_status: "mastered".to_string(),
                        }));
                    }
                }
            }
            _ => {}
        }
        Ok(None)
    }

    pub fn set_session_feeling(&self, session_id: i64, feeling: Option<i64>) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE sessions SET feeling = ?1 WHERE id = ?2", params![feeling, session_id])?;
        Ok(())
    }

    pub fn set_song_status(&self, song_id: i64, status: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE songs SET status = ?1 WHERE id = ?2", params![status, song_id])?;
        Ok(())
    }

    pub fn get_all_songs_with_stats(&self) -> Result<Vec<SongRecord>, rusqlite::Error> {
        self.get_song_stats()
    }

    pub fn get_song_with_sessions(&self, song_id: i64) -> Result<Option<SongDetail>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let song = conn.query_row(
            "SELECT sg.id, sg.title, sg.artist, sg.genre, sg.album, sg.year,
                    sg.cover_url, sg.spotify_url,
                    sg.musicbrainz_recording_id, sg.musicbrainz_release_id, sg.created_at,
                    COALESCE(SUM(s.duration_seconds), 0),
                    COUNT(s.id),
                    MAX(s.date),
                    AVG(s.feeling),
                    sg.status
             FROM songs sg
             LEFT JOIN sessions s ON s.song_id = sg.id
             WHERE sg.id = ?1
             GROUP BY sg.id",
            params![song_id],
            Self::row_to_song_stats,
        );
        match song {
            Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
            Err(e) => return Err(e),
            Ok(song) => {
                drop(conn);
                let sessions = self.get_sessions_for_song(song_id)?;
                Ok(Some(SongDetail { song, sessions }))
            }
        }
    }

    // ── Dev seed data ────────────────────────────────────────────────────────

    /// Insert realistic demo data for development. No-ops if already seeded.
    /// Returns true if data was inserted, false if already present.
    pub fn seed_dev_data(&self) -> Result<bool, rusqlite::Error> {
        use chrono::{Utc, Duration as D};

        let conn = self.conn.lock().unwrap();

        let already: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM settings WHERE key = 'dev_seeded'",
            [],
            |row| row.get(0),
        ).unwrap_or(false);
        if already { return Ok(false); }

        let now_ms = Utc::now().timestamp_millis();
        let today = Utc::now().date_naive();

        // ── Songs ──────────────────────────────────────────────────────────────
        // (title, artist, genre, album, year, spotify_url, status)
        let song_data: &[(&str, &str, &str, &str, i32, Option<&str>, &str)] = &[
            ("Clair de Lune",           "Claude Debussy",       "Classical",    "Suite bergamasque",                      1905, Some("spotify:track:5HNH5HQhWiYd9uRpKhxZol"), "mastered"),
            ("Nocturne Op. 9 No. 2",    "Frédéric Chopin",      "Classical",    "Nocturnes Op. 9",                        1832, Some("spotify:track:2ctvdKmETyYzPashp6Dbi5"), "practicing"),
            ("River Flows in You",      "Yiruma",               "Contemporary", "First Love",                             2001, Some("spotify:track:4xdcNF3HGqWZUxMkEQ8O0e"), "practicing"),
            ("Für Elise",               "Ludwig van Beethoven", "Classical",    "Bagatelles",                             1810, Some("spotify:track:3y5jFAEyPfJWVGBqyNYPMa"), "mastered"),
            ("Comptine d'un autre été", "Yann Tiersen",         "Soundtrack",   "Le Fabuleux Destin d'Amélie Poulain",    2001, Some("spotify:track:1u8c2t2Cy7UBoG4ArRcF5g"), "learning"),
            ("Gymnopédie No. 1",        "Erik Satie",           "Classical",    "Trois Gymnopédies",                      1888, Some("spotify:track:4Tr0CLtMiCLKy0yR7MzFMN"), "learning"),
            ("The Entertainer",         "Scott Joplin",         "Ragtime",      "Piano Rags",                             1902, None,                                         "mastered"),
        ];

        let mut song_ids: Vec<i64> = Vec::new();
        for (title, artist, genre, album, year, spotify_url, status) in song_data {
            conn.execute(
                "INSERT INTO songs (title, artist, genre, album, year, spotify_url, created_at, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![title, artist, genre, album, year, spotify_url, now_ms, status],
            )?;
            song_ids.push(conn.last_insert_rowid());
        }

        // ── Sessions ───────────────────────────────────────────────────────────
        // (days_ago, hour, duration_min, song_idx, feeling: 1-5 or 0=unrated)
        let sessions: &[(i64, u32, i64, usize, Option<i64>)] = &[
            (88, 9,  20, 3, None),
            (85, 10, 25, 3, Some(2)),
            (82, 9,  30, 3, Some(3)),
            (79, 11, 35, 3, Some(3)),
            (76, 9,  40, 3, Some(4)),
            (74, 10, 45, 0, None),
            (72, 9,  30, 3, Some(4)),
            (70, 21, 50, 0, Some(2)),
            (67, 9,  35, 3, Some(4)),
            (65, 10, 45, 0, Some(3)),
            (63, 9,  60, 6, None),
            (61, 10, 40, 0, Some(3)),
            (59, 9,  55, 6, Some(4)),
            (57, 11, 50, 0, Some(3)),
            (55, 9,  45, 3, Some(5)),
            (53, 10, 60, 6, Some(4)),
            (51, 9,  70, 0, Some(4)),
            (49, 10, 45, 6, Some(5)),
            (47, 9,  55, 0, Some(4)),
            (45, 14, 30, 1, None),
            (43, 9,  65, 0, Some(4)),
            (41, 10, 35, 1, Some(2)),
            (39, 9,  60, 0, Some(5)),
            (37, 10, 40, 1, Some(3)),
            (35, 9,  50, 2, None),
            (33, 11, 45, 1, Some(3)),
            (31, 9,  55, 2, Some(3)),
            (29, 10, 60, 1, Some(4)),
            (27, 9,  50, 2, Some(4)),
            (25, 10, 65, 0, Some(5)),
            (23, 9,  45, 1, Some(4)),
            (21, 10, 55, 2, Some(4)),
            (19, 9,  60, 4, None),
            (17, 10, 70, 1, Some(4)),
            (15, 9,  50, 2, Some(4)),
            (14, 10, 45, 4, Some(2)),
            (13, 9,  60, 5, None),
            (12, 10, 55, 1, Some(4)),
            (11, 9,  65, 2, Some(5)),
            (10, 10, 50, 4, Some(3)),
            (9,  9,  45, 5, Some(3)),
            (8,  10, 70, 1, Some(4)),
            (7,  9,  60, 5, Some(3)),
            (6,  10, 75, 2, Some(5)),
            (5,  9,  55, 4, Some(3)),
            (4,  10, 65, 5, Some(4)),
            (3,  9,  80, 1, Some(5)),
            (2,  10, 60, 2, Some(5)),
            (1,  9,  70, 4, Some(3)),
            (0,  10, 45, 5, Some(4)),
        ];

        for (days_ago, hour, duration_min, song_idx, feeling) in sessions {
            let session_date = today - D::days(*days_ago);
            let date_str = session_date.format("%Y-%m-%d").to_string();
            let naive_dt = session_date.and_hms_opt(*hour, 30, 0).unwrap();
            let start_ts = naive_dt.and_utc().timestamp_millis();
            let duration_s = duration_min * 60;
            let end_ts = start_ts + duration_s * 1000;
            let song_id = song_ids[*song_idx];
            let song_title: &str = song_data[*song_idx].0;

            conn.execute(
                "INSERT INTO sessions (date, start_ts, end_ts, duration_seconds, song_id, song_name, feeling)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![date_str, start_ts, end_ts, duration_s, song_id, song_title, feeling],
            )?;
        }

        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('dev_seeded', 'true')", [])?;
        Ok(true)
    }

    /// Wipe all sessions, songs and the seed flag — leaves settings otherwise intact.
    pub fn clear_dev_data(&self) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch("
            DELETE FROM midi_events;
            DELETE FROM sessions;
            DELETE FROM songs;
            DELETE FROM settings WHERE key = 'dev_seeded';
        ")?;
        Ok(())
    }

    // ── MIDI events ──────────────────────────────────────────────────────────

    pub fn insert_midi_events(&self, session_id: i64, events: &[MidiEventRecord]) -> Result<(), rusqlite::Error> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO midi_events (session_id, relative_ms, note, velocity, channel)
                 VALUES (?1, ?2, ?3, ?4, ?5)"
            )?;
            for e in events {
                stmt.execute(params![session_id, e.relative_ms,
                                     e.note as i32, e.velocity as i32, e.channel as i32])?;
            }
        }
        tx.commit()
    }

    pub fn get_midi_events(&self, session_id: i64) -> Result<Vec<MidiEventRecord>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT relative_ms, note, velocity, channel FROM midi_events
             WHERE session_id = ?1 ORDER BY relative_ms ASC"
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            Ok(MidiEventRecord {
                relative_ms: row.get(0)?,
                note: row.get::<_, i32>(1)? as u8,
                velocity: row.get::<_, i32>(2)? as u8,
                channel: row.get::<_, i32>(3)? as u8,
            })
        })?;
        rows.collect()
    }
}
