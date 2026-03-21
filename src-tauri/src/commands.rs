use tauri::State;
use tauri::Manager;
use tauri::Emitter;
use std::sync::Arc;
use crate::db::{Database, SessionRecord, DailyTotal, GoalsConfig, StreakInfo, InsightsData,
                GoalsStatus, AchievementInfo, SongRecord, SongDetail, MidiEventRecord,
                MasterySuggestion};
use crate::session::{SharedSession, SessionStatus, get_status};

pub type DbState = Arc<Database>;

#[tauri::command]
pub fn get_session_status(session: State<SharedSession>) -> SessionStatus {
    get_status(&session)
}

#[tauri::command]
pub fn get_sessions(db: State<DbState>, limit: i32) -> Result<Vec<SessionRecord>, String> {
    db.get_sessions(limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_daily_totals(db: State<DbState>, days: i32) -> Result<Vec<DailyTotal>, String> {
    db.get_daily_totals(days).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_goals(db: State<DbState>) -> Result<GoalsConfig, String> {
    db.get_goals().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_goal(db: State<DbState>, goal_type: String, minutes: i32) -> Result<(), String> {
    db.set_goal(&goal_type, minutes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_streak(db: State<DbState>) -> Result<StreakInfo, String> {
    db.get_streak().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_insights(db: State<DbState>) -> Result<InsightsData, String> {
    db.get_insights().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_goals_status(db: State<DbState>) -> Result<GoalsStatus, String> {
    db.get_goals_status().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_achievements(db: State<DbState>) -> Result<Vec<AchievementInfo>, String> {
    db.get_all_achievements().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_session_note(db: State<DbState>, id: i64, note: String) -> Result<(), String> {
    db.update_session_note(id, &note).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_setting(db: State<DbState>, key: String) -> Result<Option<String>, String> {
    db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(db: State<DbState>, key: String, value: String) -> Result<(), String> {
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reconnect_midi(force_reconnect: State<crate::session::ForceReconnect>) {
    force_reconnect.store(true, std::sync::atomic::Ordering::Relaxed);
}

// ── Learning journey commands ─────────────────────────────────────────────────

#[tauri::command]
pub fn set_session_feeling(db: State<DbState>, session_id: i64, feeling: Option<i64>) -> Result<(), String> {
    db.set_session_feeling(session_id, feeling).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_song_status(db: State<DbState>, song_id: i64, status: String) -> Result<(), String> {
    db.set_song_status(song_id, &status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_songs_with_stats(db: State<DbState>) -> Result<Vec<SongRecord>, String> {
    db.get_all_songs_with_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_song_with_sessions(db: State<DbState>, song_id: i64) -> Result<Option<SongDetail>, String> {
    db.get_song_with_sessions(song_id).map_err(|e| e.to_string())
}

// ── Post-session tagging ─────────────────────────────────────────────────────

/// Atomically tag a session with song, feeling, practice type, and note.
/// Returns a mastery suggestion if the song is ready to advance, otherwise None.
#[tauri::command]
pub fn tag_session(
    db: State<DbState>,
    session_id: i64,
    song_id: Option<i64>,
    feeling: Option<i64>,
    practice_type: Option<String>,
    note: Option<String>,
) -> Result<Option<MasterySuggestion>, String> {
    db.tag_session(
        session_id,
        song_id,
        feeling,
        practice_type.as_deref(),
        note.as_deref(),
    ).map_err(|e| e.to_string())
}

/// Advance a song's mastery status after the user confirms a suggestion.
#[tauri::command]
pub fn confirm_mastery_advance(db: State<DbState>, song_id: i64, new_status: String) -> Result<(), String> {
    db.confirm_mastery_advance(song_id, &new_status).map_err(|e| e.to_string())
}

// ── Song management commands ─────────────────────────────────────────────────

#[tauri::command]
pub fn create_song(
    db: State<DbState>,
    title: String,
    artist: Option<String>,
    genre: Option<String>,
    album: Option<String>,
    year: Option<i32>,
    cover_url: Option<String>,
    spotify_url: Option<String>,
    mb_recording_id: Option<String>,
    mb_release_id: Option<String>,
    difficulty: Option<i32>,
) -> Result<i64, String> {
    db.create_song(
        &title,
        artist.as_deref(),
        genre.as_deref(),
        album.as_deref(),
        year,
        cover_url.as_deref(),
        spotify_url.as_deref(),
        mb_recording_id.as_deref(),
        mb_release_id.as_deref(),
        difficulty,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_song_genre(db: State<DbState>, song_id: i64, genre: String) -> Result<(), String> {
    db.update_song_genre(song_id, &genre).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_song_difficulty(db: State<DbState>, song_id: i64, difficulty: Option<i32>) -> Result<(), String> {
    db.update_song_difficulty(song_id, difficulty).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_songs(db: State<DbState>) -> Result<Vec<SongRecord>, String> {
    db.get_songs().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_song_stats(db: State<DbState>) -> Result<Vec<SongRecord>, String> {
    db.get_song_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_recent_songs(db: State<DbState>, limit: i32) -> Result<Vec<SongRecord>, String> {
    db.get_recent_songs(limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn link_session_song(db: State<DbState>, session_id: i64, song_id: i64) -> Result<(), String> {
    db.link_session_song(session_id, song_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unlink_session_song(db: State<DbState>, session_id: i64) -> Result<(), String> {
    db.unlink_session_song(session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_sessions_for_song(db: State<DbState>, song_id: i64) -> Result<Vec<SessionRecord>, String> {
    db.get_sessions_for_song(song_id).map_err(|e| e.to_string())
}

// ── MIDI event commands ──────────────────────────────────────────────────────

#[tauri::command]
pub fn get_midi_events(db: State<DbState>, session_id: i64) -> Result<Vec<MidiEventRecord>, String> {
    db.get_midi_events(session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_midi_file(db: State<DbState>, session_id: i64) -> Result<Vec<u8>, String> {
    let events = db.get_midi_events(session_id).map_err(|e| e.to_string())?;
    Ok(build_midi_file(&events))
}

/// Write the MIDI file to the configured save folder (or Downloads as fallback).
/// Returns the full path so the frontend can reveal it in Explorer.
#[tauri::command]
pub fn save_midi_file(
    app: tauri::AppHandle,
    db: State<DbState>,
    session_id: i64,
    date: String,
    song_name: Option<String>,
) -> Result<String, String> {
    let events = db.get_midi_events(session_id).map_err(|e| e.to_string())?;
    let bytes = build_midi_file(&events);

    // Use midi_save_folder setting if configured, otherwise fall back to Downloads
    let save_dir = db.get_setting("midi_save_folder")
        .ok()
        .flatten()
        .filter(|p| !p.trim().is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            app.path().download_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
        });

    std::fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;
    let filename = make_midi_filename(&date, session_id, song_name.as_deref());
    let path = save_dir.join(&filename);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

/// Sanitise a string for use in a filename (keep alphanumeric, spaces, hyphens).
fn sanitise_for_filename(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == ' ' { c } else { '_' })
        .collect::<String>()
        .trim()
        .to_string()
}

fn make_midi_filename(date: &str, session_id: i64, song_name: Option<&str>) -> String {
    match song_name.filter(|n| !n.trim().is_empty()) {
        Some(name) => format!("piano-session-{}-{}.mid", date, sanitise_for_filename(name)),
        None => format!("piano-session-{}-{}.mid", date, session_id),
    }
}

fn build_midi_file(events: &[MidiEventRecord]) -> Vec<u8> {
    let ticks_per_beat: u16 = 480;
    let tempo_us: u32 = 500_000; // 120 BPM
    let ms_per_tick = tempo_us as f64 / 1000.0 / ticks_per_beat as f64;

    let mut track: Vec<u8> = Vec::new();

    // Tempo meta event at tick 0: delta=0, FF 51 03 <3-byte tempo>
    write_var_len(&mut track, 0);
    track.extend_from_slice(&[0xFF, 0x51, 0x03]);
    track.push(((tempo_us >> 16) & 0xFF) as u8);
    track.push(((tempo_us >> 8) & 0xFF) as u8);
    track.push((tempo_us & 0xFF) as u8);

    let mut last_tick: u32 = 0;
    for ev in events {
        let abs_tick = (ev.relative_ms as f64 / ms_per_tick).round() as u32;
        let delta = abs_tick.saturating_sub(last_tick);
        last_tick = abs_tick;

        write_var_len(&mut track, delta);
        let status_byte = if ev.velocity > 0 {
            0x90 | (ev.channel & 0x0F)
        } else {
            0x80 | (ev.channel & 0x0F)
        };
        track.extend_from_slice(&[status_byte, ev.note, ev.velocity]);
    }

    // End of track: delta=0, FF 2F 00
    write_var_len(&mut track, 0);
    track.extend_from_slice(&[0xFF, 0x2F, 0x00]);

    let mut out: Vec<u8> = Vec::new();
    // MIDI header chunk
    out.extend_from_slice(b"MThd");
    out.extend_from_slice(&6u32.to_be_bytes());
    out.extend_from_slice(&0u16.to_be_bytes()); // format 0
    out.extend_from_slice(&1u16.to_be_bytes()); // 1 track
    out.extend_from_slice(&ticks_per_beat.to_be_bytes());
    // Track chunk
    out.extend_from_slice(b"MTrk");
    out.extend_from_slice(&(track.len() as u32).to_be_bytes());
    out.extend_from_slice(&track);
    out
}

fn write_var_len(buf: &mut Vec<u8>, mut val: u32) {
    let mut bytes = [0u8; 4];
    let mut count = 0;
    loop {
        bytes[count] = (val & 0x7F) as u8;
        count += 1;
        val >>= 7;
        if val == 0 { break; }
    }
    for i in (0..count).rev() {
        let b = if i > 0 { bytes[i] | 0x80 } else { bytes[i] };
        buf.push(b);
    }
}

// ── Dev / demo data ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn seed_dev_data(db: State<DbState>) -> Result<bool, String> {
    db.seed_dev_data().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_dev_data(db: State<DbState>) -> Result<(), String> {
    db.clear_dev_data().map_err(|e| e.to_string())
}

/// Insert a fake session and emit `session-ended` so the tagging modal appears.
#[tauri::command]
pub fn dev_simulate_session_ended(
    app: tauri::AppHandle,
    db: State<DbState>,
    duration_seconds: i64,
) -> Result<(), String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    use chrono::Local;

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let start_ms = now_ms - duration_seconds * 1000;
    let date = Local::now().format("%Y-%m-%d").to_string();

    let session_id = db
        .insert_session(&date, start_ms, now_ms, duration_seconds)
        .map_err(|e| e.to_string())?;

    app.emit("session-ended", crate::session::SessionEndedPayload {
        session_id,
        duration_seconds,
    }).map_err(|e: tauri::Error| e.to_string())?;

    Ok(())
}
