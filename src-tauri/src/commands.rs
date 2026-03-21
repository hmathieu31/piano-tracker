use tauri::State;
use tauri::Manager;
use std::sync::Arc;
use crate::db::{Database, SessionRecord, DailyTotal, GoalsConfig, StreakInfo, InsightsData,
                GoalsStatus, AchievementInfo, SongRecord, MidiEventRecord};
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
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_song_genre(db: State<DbState>, song_id: i64, genre: String) -> Result<(), String> {
    db.update_song_genre(song_id, &genre).map_err(|e| e.to_string())
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

/// Write the MIDI file to the user's Downloads folder and return the full path.
/// The frontend can then use revealItemInDir (plugin-opener) to show it in Explorer.
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

    let downloads = app.path().download_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&downloads).map_err(|e| e.to_string())?;
    let filename = make_midi_filename(&date, session_id, song_name.as_deref());
    let path = downloads.join(&filename);
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

/// Upload MIDI data for a session directly to a Cozy Cloud drive folder.
///
/// Settings keys used (get_setting):
///   cozy_url    – e.g. https://myname.mycozy.cloud
///   cozy_token  – OAuth2 Bearer token
///   cozy_folder – target folder path, e.g. /Piano Sessions
///
/// Returns the Cozy file URL on success.
#[tauri::command]
pub async fn upload_midi_to_cozy(
    db: State<'_, DbState>,
    session_id: i64,
    date: String,
    song_name: Option<String>,
) -> Result<String, String> {
    // Read settings
    let cozy_url = db.get_setting("cozy_url").map_err(|e| e.to_string())?
        .ok_or("Cozy URL not configured. Open Settings → Cozy Cloud.")?;
    let cozy_token = db.get_setting("cozy_token").map_err(|e| e.to_string())?
        .ok_or("Cozy token not configured. Open Settings → Cozy Cloud.")?;
    let cozy_folder = db.get_setting("cozy_folder").map_err(|e| e.to_string())?
        .unwrap_or_else(|| "/Piano Sessions".to_string());

    let base = cozy_url.trim_end_matches('/');
    let filename = make_midi_filename(&date, session_id, song_name.as_deref());
    let midi_bytes = build_midi_file(&db.get_midi_events(session_id).map_err(|e| e.to_string())?);

    let client = reqwest::Client::new();
    let auth = format!("Bearer {}", cozy_token.trim());

    // 1. Resolve the target folder, creating it if it doesn't exist.
    let folder_id = ensure_cozy_folder(&client, base, &auth, &cozy_folder).await?;

    // 2. Upload the file into that folder.
    let upload_url = format!(
        "{}/files/{}?Type=file&Name={}&ContentLength={}",
        base,
        folder_id,
        urlencoding_encode(&filename),
        midi_bytes.len()
    );
    let resp = client
        .post(&upload_url)
        .header("Authorization", &auth)
        .header("Content-Type", "audio/midi")
        .body(midi_bytes)
        .send()
        .await
        .map_err(|e| format!("Upload request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Cozy upload failed ({}): {}", status, body));
    }

    let json: serde_json::Value = resp.json().await
        .map_err(|e| format!("Failed to parse Cozy response: {}", e))?;

    // Return the shareable link or just the file path for confirmation
    let cozy_path = json["data"]["attributes"]["path"]
        .as_str()
        .unwrap_or(&filename)
        .to_string();

    Ok(format!("{}/#/drive{}", base, cozy_path))
}

/// Ensure the given folder path exists in Cozy and return its `_id`.
async fn ensure_cozy_folder(
    client: &reqwest::Client,
    base: &str,
    auth: &str,
    folder_path: &str,
) -> Result<String, String> {
    let folder_path = if folder_path.starts_with('/') {
        folder_path.to_string()
    } else {
        format!("/{}", folder_path)
    };

    // Try to get folder metadata by path
    let meta_url = format!("{}/files/metadata?Path={}", base, urlencoding_encode(&folder_path));
    let resp = client
        .get(&meta_url)
        .header("Authorization", auth)
        .send()
        .await
        .map_err(|e| format!("Cozy metadata request failed: {}", e))?;

    if resp.status().is_success() {
        let json: serde_json::Value = resp.json().await
            .map_err(|e| format!("Failed to parse Cozy metadata: {}", e))?;
        return json["data"]["_id"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "Cozy folder ID not found in response".to_string());
    }

    if resp.status().as_u16() == 404 {
        // Create the folder under the root directory
        let folder_name = folder_path.trim_matches('/').split('/').last()
            .unwrap_or("Piano Sessions");
        let create_url = format!(
            "{}/files/io.cozy.files.root-dir?Type=directory&Name={}",
            base,
            urlencoding_encode(folder_name)
        );
        let create_resp = client
            .post(&create_url)
            .header("Authorization", auth)
            .header("Content-Type", "application/json")
            .send()
            .await
            .map_err(|e| format!("Cozy mkdir failed: {}", e))?;

        if !create_resp.status().is_success() {
            let status = create_resp.status();
            let body = create_resp.text().await.unwrap_or_default();
            return Err(format!("Could not create Cozy folder ({}): {}", status, body));
        }

        let json: serde_json::Value = create_resp.json().await
            .map_err(|e| format!("Failed to parse Cozy mkdir response: {}", e))?;
        return json["data"]["_id"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "Cozy created folder ID not found".to_string());
    }

    Err(format!("Cozy folder lookup failed ({})", resp.status()))
}

/// Percent-encode a string for use in a URL query parameter.
fn urlencoding_encode(s: &str) -> String {
    s.chars().flat_map(|c| {
        if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '~' {
            vec![c]
        } else {
            let encoded = format!("%{:02X}", c as u32);
            encoded.chars().collect()
        }
    }).collect()
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
