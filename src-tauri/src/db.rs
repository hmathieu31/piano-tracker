use std::sync::Mutex;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

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

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Normalized identity of a name: trimmed, inner whitespace collapsed, lowercase.
pub fn name_key(name: &str) -> String {
    name.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

fn clean(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|v| !v.is_empty())
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

// ── Catalog helpers (shared with the migration) ──────────────────────────────

pub fn artist_id(conn: &Connection, name: &str, now: i64) -> rusqlite::Result<i64> {
    let key = name_key(name);
    if let Some(id) = conn.query_row(
        "SELECT id FROM artists WHERE name_key = ?1", params![key], |r| r.get(0),
    ).optional()? {
        return Ok(id);
    }
    conn.execute(
        "INSERT INTO artists (name, name_key, created_at) VALUES (?1, ?2, ?3)",
        params![name.trim(), key, now],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn genre_id(conn: &Connection, name: &str) -> rusqlite::Result<i64> {
    let key = name_key(name);
    if let Some(id) = conn.query_row(
        "SELECT id FROM genres WHERE name_key = ?1", params![key], |r| r.get(0),
    ).optional()? {
        return Ok(id);
    }
    conn.execute("INSERT INTO genres (name, name_key) VALUES (?1, ?2)", params![name.trim(), key])?;
    Ok(conn.last_insert_rowid())
}

fn album_id(
    conn: &Connection,
    title: &str,
    artist_id: Option<i64>,
    year: Option<i32>,
    cover_url: Option<&str>,
) -> rusqlite::Result<i64> {
    let key = name_key(title);
    if let Some(id) = conn.query_row(
        "SELECT id FROM albums WHERE title_key = ?1 AND COALESCE(artist_id, 0) = COALESCE(?2, 0)",
        params![key, artist_id],
        |r| r.get(0),
    ).optional()? {
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

/// Return the catalog entry for this song, creating it if needed. A song is
/// identified by its iTunes track id when one is given, else by normalized
/// title + artist; a title without an artist matches any song with that title.
/// Details an existing entry is missing are filled in, never overwritten.
/// `id` forces the id of a newly created song (used by the migration).
pub fn find_or_create_song(
    conn: &Connection,
    song: &NewSong,
    now: i64,
    id: Option<i64>,
) -> rusqlite::Result<i64> {
    let title = song.title.trim();
    let title_key = name_key(title);
    if title_key.is_empty() {
        return Err(rusqlite::Error::InvalidParameterName("song title must not be empty".into()));
    }
    let itunes_id = clean(song.itunes_track_id);

    let mut existing: Option<i64> = None;
    if let Some(ext) = itunes_id {
        existing = conn.query_row(
            "SELECT song_id FROM song_external_ids WHERE provider = 'itunes' AND external_id = ?1",
            params![ext],
            |r| r.get(0),
        ).optional()?;
    }
    let artist = match (existing, clean(song.artist)) {
        // Matched by track id: keep the artist the catalog already has.
        (Some(sid), _) => conn.query_row(
            "SELECT artist_id FROM songs WHERE id = ?1", params![sid], |r| r.get(0),
        )?,
        (None, Some(name)) => Some(artist_id(conn, name, now)?),
        (None, None) => None,
    };
    if existing.is_none() {
        existing = match artist {
            Some(a) => conn.query_row(
                "SELECT id FROM songs WHERE title_key = ?1 AND artist_id = ?2",
                params![title_key, a],
                |r| r.get(0),
            ).optional()?,
            None => conn.query_row(
                "SELECT id FROM songs WHERE title_key = ?1 ORDER BY artist_id IS NOT NULL, id LIMIT 1",
                params![title_key],
                |r| r.get(0),
            ).optional()?,
        };
    }

    let album = match clean(song.album) {
        Some(t) => Some(album_id(conn, t, artist, song.year, clean(song.cover_url))?),
        None => None,
    };
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
        let gid = genre_id(conn, g)?;
        conn.execute(
            "INSERT OR IGNORE INTO song_genres (song_id, genre_id) VALUES (?1, ?2)",
            params![song_id, gid],
        )?;
    }
    if let Some(ext) = itunes_id {
        conn.execute(
            "INSERT OR IGNORE INTO song_external_ids (song_id, provider, external_id) VALUES (?1, 'itunes', ?2)",
            params![song_id, ext],
        )?;
    }
    Ok(song_id)
}

/// Move a song to a new mastery stage and record the change.
fn change_status(
    conn: &Connection,
    song_id: i64,
    status: &str,
    session_id: Option<i64>,
) -> rusqlite::Result<()> {
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

// ── Row mapping ──────────────────────────────────────────────────────────────

/// Columns read by `row_to_song`, in order. Needs `SONG_JOINS` on alias `sg`.
const SONG_COLUMNS: &str = "
    sg.id, sg.title, sg.artist_id, ar.name, sg.album_id, al.title,
    (SELECT GROUP_CONCAT(name, char(31)) FROM (
        SELECT g.name FROM song_genres x JOIN genres g ON g.id = x.genre_id
        WHERE x.song_id = sg.id ORDER BY g.id)),
    sg.year, COALESCE(sg.cover_url, al.cover_url), sg.created_at, sg.status, sg.difficulty,
    COALESCE(st.total_seconds, 0), COALESCE(st.session_count, 0),
    st.last_played_date, st.avg_feeling";

const SONG_JOINS: &str = "
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

fn session_query(tail: &str) -> String {
    format!(
        "SELECT s.id, s.practice_date, s.started_at, s.ended_at, s.duration_seconds, s.note,
                s.song_id, s.feeling, s.practice_type, {SONG_COLUMNS}
         FROM sessions s LEFT JOIN songs sg ON sg.id = s.song_id {SONG_JOINS} {tail}"
    )
}

/// Read a song starting at column `o`.
fn row_to_song(row: &rusqlite::Row, o: usize) -> rusqlite::Result<SongRecord> {
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

fn row_to_session(row: &rusqlite::Row) -> rusqlite::Result<SessionRecord> {
    let song = match row.get::<_, Option<i64>>(9)? {
        Some(_) => Some(row_to_song(row, 9)?),
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

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &std::path::Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        Ok(Database { conn: Mutex::new(conn) })
    }

    pub fn init(&self) -> Result<(), rusqlite::Error> {
        let mut conn = self.conn.lock().unwrap();
        crate::schema::migrate(&mut conn)
    }

    pub fn insert_session(&self, date: &str, start_ts: i64, end_ts: i64) -> Result<i64, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO sessions (practice_date, started_at, ended_at) VALUES (?1, ?2, ?3)",
            params![date, start_ts, end_ts],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn update_session_note(&self, id: i64, note: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE sessions SET note = ?1 WHERE id = ?2", params![note, id])?;
        Ok(())
    }

    pub fn get_session(&self, id: i64) -> Result<Option<SessionRecord>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(&session_query("WHERE s.id = ?1"), params![id], row_to_session).optional()
    }

    pub fn get_sessions(&self, limit: i32) -> Result<Vec<SessionRecord>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&session_query("ORDER BY s.started_at DESC LIMIT ?1"))?;
        let rows = stmt.query_map(params![limit], row_to_session)?;
        rows.collect()
    }

    pub fn get_sessions_for_song(&self, song_id: i64) -> Result<Vec<SessionRecord>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&session_query("WHERE s.song_id = ?1 ORDER BY s.started_at DESC"))?;
        let rows = stmt.query_map(params![song_id], row_to_session)?;
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
            "SELECT practice_date, SUM(duration_seconds), COUNT(*) FROM sessions
             WHERE practice_date >= ?1 AND practice_date <= ?2 GROUP BY practice_date"
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
            "SELECT DISTINCT practice_date FROM sessions ORDER BY practice_date DESC"
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
            "SELECT COALESCE(SUM(duration_seconds), 0), practice_date FROM sessions GROUP BY practice_date ORDER BY SUM(duration_seconds) DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?))
        ).unwrap_or((0, None));

        let mut stmt = conn.prepare(
            "SELECT started_at, duration_seconds FROM sessions"
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
            "SELECT COALESCE(SUM(duration_seconds), 0) FROM sessions WHERE practice_date = ?1",
            params![today_str], |r| r.get(0)
        ).unwrap_or(0);

        let daily_goal_seconds = config.daily_minutes as i64 * 60;
        let mut past_week_days = Vec::new();
        for i in (0..7i64).rev() {
            let d = today - Duration::days(i);
            let d_str = d.format("%Y-%m-%d").to_string();
            let secs: i64 = conn.query_row(
                "SELECT COALESCE(SUM(duration_seconds), 0) FROM sessions WHERE practice_date = ?1",
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

        let mut streak_stmt = conn.prepare("SELECT DISTINCT practice_date FROM sessions ORDER BY practice_date DESC")?;
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

        let now = now_ms();

        let mut newly_unlocked = Vec::new();
        for (key, condition) in &achievements {
            if *condition {
                let result = conn.execute(
                    "INSERT OR IGNORE INTO achievements (key, unlocked_at, session_id) VALUES (?1, ?2, ?3)",
                    params![key, now, session.id],
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

    pub fn create_song(&self, song: &NewSong) -> Result<i64, rusqlite::Error> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let id = find_or_create_song(&tx, song, now_ms(), None)?;
        tx.commit()?;
        Ok(id)
    }

    /// Make `genre` the song's only genre.
    pub fn update_song_genre(&self, song_id: i64, genre: &str) -> Result<(), rusqlite::Error> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM song_genres WHERE song_id = ?1", params![song_id])?;
        if let Some(name) = clean(Some(genre)) {
            let gid = genre_id(&tx, name)?;
            tx.execute(
                "INSERT INTO song_genres (song_id, genre_id) VALUES (?1, ?2)",
                params![song_id, gid],
            )?;
        }
        tx.commit()
    }

    pub fn update_song_difficulty(&self, song_id: i64, difficulty: Option<i32>) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE songs SET difficulty = ?1, updated_at = ?2 WHERE id = ?3",
            params![difficulty, now_ms(), song_id],
        )?;
        Ok(())
    }

    pub fn get_songs(&self) -> Result<Vec<SongRecord>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&song_query("ORDER BY sg.title COLLATE NOCASE"))?;
        let rows = stmt.query_map([], |r| row_to_song(r, 0))?;
        rows.collect()
    }

    /// Every song in the catalog, most practised first.
    pub fn get_song_stats(&self) -> Result<Vec<SongRecord>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&song_query(
            "ORDER BY COALESCE(st.total_seconds, 0) DESC, sg.title COLLATE NOCASE",
        ))?;
        let rows = stmt.query_map([], |r| row_to_song(r, 0))?;
        rows.collect()
    }

    /// Songs with at least one session, most recently played first.
    pub fn get_recent_songs(&self, limit: i32) -> Result<Vec<SongRecord>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&song_query(
            "WHERE st.session_count > 0 ORDER BY st.last_started_at DESC LIMIT ?1",
        ))?;
        let rows = stmt.query_map(params![limit], |r| row_to_song(r, 0))?;
        rows.collect()
    }

    // ── Session-Song linking ─────────────────────────────────────────────────
    // Songs stay in the catalog when sessions are untagged.

    pub fn link_session_song(&self, session_id: i64, song_id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET song_id = ?1 WHERE id = ?2",
            params![song_id, session_id],
        )?;
        Ok(())
    }

    pub fn unlink_session_song(&self, session_id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE sessions SET song_id = NULL WHERE id = ?1", params![session_id])?;
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
        conn.execute(
            "UPDATE sessions SET song_id = ?1, feeling = ?2, practice_type = ?3,
                     note = CASE WHEN ?4 IS NOT NULL THEN ?4 ELSE note END
             WHERE id = ?5",
            params![song_id, feeling, practice_type, note, session_id],
        )?;

        match song_id {
            Some(sid) => Self::compute_mastery_suggestion_inner(&conn, sid),
            None => Ok(None),
        }
    }

    /// Advance a song's mastery status (called after user confirms the suggestion).
    /// The change is credited to the song's latest session, which triggered it.
    pub fn confirm_mastery_advance(&self, song_id: i64, new_status: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let latest: Option<i64> = conn.query_row(
            "SELECT id FROM sessions WHERE song_id = ?1 ORDER BY started_at DESC LIMIT 1",
            params![song_id],
            |r| r.get(0),
        ).optional()?;
        change_status(&conn, song_id, new_status, latest)
    }

    fn compute_mastery_suggestion_inner(
        conn: &rusqlite::Connection,
        song_id: i64,
    ) -> Result<Option<MasterySuggestion>, rusqlite::Error> {
        let (title, current): (String, String) = conn.query_row(
            "SELECT title, status FROM songs WHERE id = ?1",
            params![song_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        match current.as_str() {
            "learning" => {
                // Need ≥3 tagged sessions, of which ≥2 are 'full' or 'performance'
                let types: Vec<Option<String>> = {
                    let mut stmt = conn.prepare(
                        "SELECT practice_type FROM sessions WHERE song_id = ?1
                         AND practice_type IS NOT NULL
                         ORDER BY started_at DESC LIMIT 3"
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
                         ORDER BY started_at DESC LIMIT 7"
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
        change_status(&conn, song_id, status, None)
    }

    pub fn get_all_songs_with_stats(&self) -> Result<Vec<SongRecord>, rusqlite::Error> {
        self.get_song_stats()
    }

    pub fn get_song_with_sessions(&self, song_id: i64) -> Result<Option<SongDetail>, rusqlite::Error> {
        let song = {
            let conn = self.conn.lock().unwrap();
            conn.query_row(&song_query("WHERE sg.id = ?1"), params![song_id], |r| row_to_song(r, 0))
                .optional()?
        };
        match song {
            None => Ok(None),
            Some(song) => {
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

        let mut conn = self.conn.lock().unwrap();

        let already: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM settings WHERE key = 'dev_seeded'",
            [],
            |row| row.get(0),
        ).unwrap_or(false);
        if already { return Ok(false); }

        let tx = conn.transaction()?;
        let now = now_ms();
        let today = Utc::now().date_naive();

        // ── Songs ──────────────────────────────────────────────────────────────
        // (title, artist, genre, album, year, status)
        let song_data: &[(&str, &str, &str, &str, i32, &str)] = &[
            ("Clair de Lune",           "Claude Debussy",       "Classical",    "Suite bergamasque",                      1905, "mastered"),
            ("Nocturne Op. 9 No. 2",    "Frédéric Chopin",      "Classical",    "Nocturnes Op. 9",                        1832, "practicing"),
            ("River Flows in You",      "Yiruma",               "Contemporary", "First Love",                             2001, "practicing"),
            ("Für Elise",               "Ludwig van Beethoven", "Classical",    "Bagatelles",                             1810, "mastered"),
            ("Comptine d'un autre été", "Yann Tiersen",         "Soundtrack",   "Le Fabuleux Destin d'Amélie Poulain",    2001, "learning"),
            ("Gymnopédie No. 1",        "Erik Satie",           "Classical",    "Trois Gymnopédies",                      1888, "learning"),
            ("The Entertainer",         "Scott Joplin",         "Ragtime",      "Piano Rags",                             1902, "mastered"),
        ];

        let mut song_ids: Vec<i64> = Vec::new();
        for (title, artist, genre, album, year, status) in song_data {
            let id = find_or_create_song(&tx, &NewSong {
                title, artist: Some(artist), genre: Some(genre), album: Some(album), year: Some(*year),
                cover_url: None, itunes_track_id: None, difficulty: None,
            }, now, None)?;
            change_status(&tx, id, status, None)?;
            song_ids.push(id);
        }

        // ── Sessions ───────────────────────────────────────────────────────────
        // (days_ago, hour, duration_min, song_idx, feeling: 1-5 or None=unrated)
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
            let end_ts = start_ts + duration_min * 60 * 1000;

            tx.execute(
                "INSERT INTO sessions (practice_date, started_at, ended_at, song_id, feeling)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![date_str, start_ts, end_ts, song_ids[*song_idx], feeling],
            )?;
        }

        tx.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('dev_seeded', 'true')", [])?;
        tx.commit()?;
        Ok(true)
    }

    /// Wipe all sessions, the song catalog and the seed flag — leaves settings otherwise intact.
    pub fn clear_dev_data(&self) -> Result<(), rusqlite::Error> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        tx.execute_batch("
            DELETE FROM midi_events;
            DELETE FROM sessions;
            DELETE FROM song_status_changes;
            DELETE FROM song_genres;
            DELETE FROM song_credits;
            DELETE FROM song_external_ids;
            DELETE FROM songs;
            DELETE FROM albums;
            DELETE FROM artists;
            DELETE FROM genres;
            DELETE FROM settings WHERE key = 'dev_seeded';
        ")?;
        tx.commit()
    }

    // ── MIDI events ──────────────────────────────────────────────────────────

    pub fn insert_midi_events(&self, session_id: i64, events: &[MidiEventRecord]) -> Result<(), rusqlite::Error> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        {
            let first_seq: i64 = tx.query_row(
                "SELECT COALESCE(MAX(seq) + 1, 0) FROM midi_events WHERE session_id = ?1",
                params![session_id],
                |r| r.get(0),
            )?;
            let mut stmt = tx.prepare(
                "INSERT INTO midi_events (session_id, seq, relative_ms, note, velocity, channel)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
            )?;
            for (i, e) in events.iter().enumerate() {
                stmt.execute(params![session_id, first_seq + i as i64, e.relative_ms,
                                     e.note as i32, e.velocity as i32, e.channel as i32])?;
            }
        }
        tx.commit()
    }

    /// Crop sessions whose saved end is far past the last note actually played
    /// (e.g. the laptop slept mid-session, so the end was only detected on resume).
    /// The session is trimmed to its last note-on plus `silence_ms`, matching where
    /// a normal session ends, and MIDI events past that point are dropped.
    /// Sessions without recorded notes are left alone. Returns the number cropped.
    pub fn crop_runaway_sessions(&self, silence_ms: i64) -> Result<usize, rusqlite::Error> {
        // Normal sessions end at last note + silence (+ up to one 500ms debounce
        // tick), so only touch sessions that overshoot by more than a minute.
        const SLACK_MS: i64 = 60_000;
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let candidates: Vec<(i64, i64, i64)> = {
            let mut stmt = tx.prepare(
                "SELECT s.id, s.started_at, MAX(m.relative_ms) FROM sessions s
                 JOIN midi_events m ON m.session_id = s.id AND m.velocity > 0
                 GROUP BY s.id
                 HAVING s.ended_at > s.started_at + MAX(m.relative_ms) + ?1"
            )?;
            let rows = stmt.query_map(params![silence_ms + SLACK_MS], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?;
            rows.collect::<Result<_, _>>()?
        };
        for (id, start_ts, last_note_ms) in &candidates {
            let cutoff_ms = last_note_ms + silence_ms;
            let end_ts = start_ts + cutoff_ms;
            // Sessions are dated by their end, like when they are first saved.
            let date = chrono::DateTime::from_timestamp_millis(end_ts)
                .map(|t| t.with_timezone(&chrono::Local).format("%Y-%m-%d").to_string());
            tx.execute(
                "UPDATE sessions SET ended_at = ?1, practice_date = COALESCE(?2, practice_date)
                 WHERE id = ?3",
                params![end_ts, date, id],
            )?;
            tx.execute(
                "DELETE FROM midi_events WHERE session_id = ?1 AND relative_ms > ?2",
                params![id, cutoff_ms],
            )?;
        }
        tx.commit()?;
        Ok(candidates.len())
    }

    pub fn get_midi_events(&self, session_id: i64) -> Result<Vec<MidiEventRecord>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT relative_ms, note, velocity, channel FROM midi_events
             WHERE session_id = ?1 ORDER BY seq ASC"
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

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Database {
        let db = Database::new(std::path::Path::new(":memory:")).unwrap();
        db.init().unwrap();
        db
    }

    fn note(relative_ms: i64, velocity: u8) -> MidiEventRecord {
        MidiEventRecord { relative_ms, note: 60, velocity, channel: 0 }
    }

    fn session(db: &Database, id: i64) -> (i64, i64, i64) {
        let conn = db.conn.lock().unwrap();
        conn.query_row(
            "SELECT started_at, ended_at, duration_seconds FROM sessions WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).unwrap()
    }

    fn song<'a>(title: &'a str, artist: Option<&'a str>, itunes: Option<&'a str>) -> NewSong<'a> {
        NewSong {
            title, artist, genre: Some("Classical"), album: Some("Album"), year: Some(2004),
            cover_url: Some("cover.jpg"), itunes_track_id: itunes, difficulty: None,
        }
    }

    #[test]
    fn crops_runaway_session_to_last_note_plus_silence() {
        let db = db();
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

        assert_eq!(session(&db, runaway), (start, start + 610_000, 610));
        let kept: Vec<i64> = db.get_midi_events(runaway).unwrap().iter().map(|e| e.relative_ms).collect();
        assert_eq!(kept, vec![0, 600_000, 605_000]);
        assert_eq!(session(&db, normal), (start, start + 130_400, 130));
        assert_eq!(session(&db, no_midi), (start, start + 36_000_000, 36_000));

        // Idempotent: a second run finds nothing left to crop.
        assert_eq!(db.crop_runaway_sessions(10_000).unwrap(), 0);
    }

    #[test]
    fn create_song_reuses_catalog_entries() {
        let db = db();
        let a = db.create_song(&song("Clair de Lune", Some("Claude Debussy"), Some("123"))).unwrap();
        // Same title and artist, different spelling: same song.
        assert_eq!(db.create_song(&song(" clair  de lune ", Some("claude debussy"), None)).unwrap(), a);
        // Same iTunes track: same song even if the title differs.
        assert_eq!(db.create_song(&song("Clair de lune (Remastered)", Some("Debussy"), Some("123"))).unwrap(), a);
        // Title typed without an artist matches the existing song.
        assert_eq!(db.create_song(&song("Clair de lune", None, None)).unwrap(), a);
        // Same title by another artist is a different song.
        assert_ne!(db.create_song(&song("Clair de Lune", Some("Someone Else"), None)).unwrap(), a);

        let songs = db.get_songs().unwrap();
        let s = songs.iter().find(|s| s.id == a).unwrap();
        assert_eq!(s.artist.as_deref(), Some("Claude Debussy"));
        assert_eq!(s.album.as_deref(), Some("Album"));
        assert_eq!(s.cover_url.as_deref(), Some("cover.jpg"));
        assert_eq!(s.genres, vec!["Classical".to_string()]);
        assert_eq!(s.status, "learning");
        // The iTunes match kept the catalog's artist instead of adding "Debussy".
        let conn = db.conn.lock().unwrap();
        let artists: i64 = conn.query_row("SELECT COUNT(*) FROM artists", [], |r| r.get(0)).unwrap();
        assert_eq!(artists, 2);
    }

    #[test]
    fn songs_outlive_their_sessions() {
        let db = db();
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

    #[test]
    fn foreign_keys_and_checks_are_enforced() {
        let db = db();
        let song_id = db.create_song(&song("Für Elise", Some("Beethoven"), None)).unwrap();
        let s = db.insert_session("2026-10-01", 0, 60_000).unwrap();
        db.insert_midi_events(s, &[note(0, 80)]).unwrap();
        db.link_session_song(s, song_id).unwrap();

        assert!(db.link_session_song(s, 999).is_err());
        assert!(db.tag_session(s, Some(song_id), Some(9), None, None).is_err());
        assert!(db.tag_session(s, Some(song_id), None, Some("noodling"), None).is_err());
        assert!(db.set_song_status(song_id, "legendary").is_err());

        let conn = db.conn.lock().unwrap();
        // A song with practice history cannot be deleted.
        assert!(conn.execute("DELETE FROM songs WHERE id = ?1", params![song_id]).is_err());
        // Deleting a session removes its MIDI events.
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![s]).unwrap();
        let left: i64 = conn.query_row("SELECT COUNT(*) FROM midi_events", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 0);
    }

    #[test]
    fn mastery_changes_are_recorded() {
        let db = db();
        let song_id = db.create_song(&song("Nuvole Bianche", Some("Ludovico Einaudi"), None)).unwrap();
        let mut suggestion = None;
        for (i, kind) in ["full", "section", "performance"].iter().enumerate() {
            let s = db.insert_session("2026-10-01", i as i64 * 100_000, i as i64 * 100_000 + 60_000).unwrap();
            suggestion = db.tag_session(s, Some(song_id), Some(4), Some(kind), None).unwrap();
        }
        let suggestion = suggestion.expect("three sessions with two strong runs suggest advancing");
        assert_eq!(suggestion.suggested_status, "practicing");
        db.confirm_mastery_advance(song_id, &suggestion.suggested_status).unwrap();

        let conn = db.conn.lock().unwrap();
        let history: Vec<(Option<String>, String, Option<i64>)> = conn.prepare(
            "SELECT from_status, to_status, session_id FROM song_status_changes WHERE song_id = ?1 ORDER BY id",
        ).unwrap().query_map(params![song_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(history, vec![
            (None, "learning".into(), None),
            (Some("learning".into()), "practicing".into(), Some(3)),
        ]);
    }

    #[test]
    fn seed_and_clear_dev_data() {
        let db = db();
        assert!(db.seed_dev_data().unwrap());
        assert!(!db.seed_dev_data().unwrap());
        let songs = db.get_song_stats().unwrap();
        assert_eq!(songs.len(), 7);
        assert!(songs.iter().all(|s| s.session_count > 0));
        assert_eq!(db.get_sessions(100).unwrap().len(), 50);
        db.clear_dev_data().unwrap();
        assert!(db.get_songs().unwrap().is_empty());
        assert!(db.get_sessions(10).unwrap().is_empty());
    }
}
