use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use std::thread;
use midir::MidiInput;
use chrono::Local;
use tauri::AppHandle;
use tauri::Emitter;
use crate::db::Database;

pub struct SessionInner {
    pub is_active: bool,
    pub start_ts: Option<i64>,
    pub last_midi_instant: Option<Instant>,
    pub midi_port_name: Option<String>,
    pub midi_connected: bool,
}

pub type SharedSession = Arc<Mutex<SessionInner>>;

#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionStatus {
    pub is_playing: bool,
    pub session_start_ts: Option<i64>,
    pub elapsed_seconds: i64,
    pub midi_port_name: Option<String>,
    pub midi_connected: bool,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

pub fn get_status(inner: &SharedSession) -> SessionStatus {
    let s = inner.lock().unwrap();
    let elapsed = if s.is_active {
        if let Some(start) = s.start_ts {
            (now_ms() - start) / 1000
        } else { 0 }
    } else { 0 };
    SessionStatus {
        is_playing: s.is_active,
        session_start_ts: s.start_ts,
        elapsed_seconds: elapsed,
        midi_port_name: s.midi_port_name.clone(),
        midi_connected: s.midi_connected,
    }
}

pub fn start_midi_listener(
    app_handle: AppHandle,
    db: Arc<Database>,
    session: SharedSession,
) {
    let session_for_midi = session.clone();
    let session_for_debounce = session.clone();

    thread::spawn(move || {
        loop {
            let result = try_connect_midi(session_for_midi.clone());
            match result {
                Ok(_conn) => {
                    loop {
                        thread::sleep(Duration::from_secs(3600));
                    }
                }
                Err(_) => {
                    {
                        let mut s = session_for_midi.lock().unwrap();
                        s.midi_connected = false;
                        s.midi_port_name = None;
                    }
                    thread::sleep(Duration::from_secs(5));
                }
            }
        }
    });

    let db_debounce = db.clone();
    let app_debounce = app_handle.clone();
    thread::spawn(move || {
        let debounce = Duration::from_secs(10);
        loop {
            thread::sleep(Duration::from_millis(500));

            let (should_start, should_end, start_ts_to_save) = {
                let mut s = session_for_debounce.lock().unwrap();
                let should_start = !s.is_active
                    && s.last_midi_instant.is_some()
                    && s.midi_connected;

                let should_end = s.is_active && s.last_midi_instant
                    .map(|t| t.elapsed() > debounce)
                    .unwrap_or(false);

                if should_start {
                    s.is_active = true;
                    s.start_ts = Some(now_ms());
                }

                let start_ts_to_save = if should_end { s.start_ts } else { None };
                if should_end {
                    s.is_active = false;
                    s.start_ts = None;
                    s.last_midi_instant = None;
                }

                (should_start, should_end, start_ts_to_save)
            };

            if should_start {
                let _ = app_debounce.emit("session-started", ());
            }

            if should_end {
                if let Some(start_ts) = start_ts_to_save {
                    let end_ts = now_ms();
                    let duration_seconds = (end_ts - start_ts) / 1000;
                    let date = Local::now().format("%Y-%m-%d").to_string();

                    if duration_seconds >= 5 {
                        if let Ok(session_id) = db_debounce.insert_session(
                            &date, start_ts, end_ts, duration_seconds
                        ) {
                            if let Ok(sessions) = db_debounce.get_sessions(1) {
                                if let Some(session_record) = sessions.first() {
                                    if let Ok(new_achievements) = db_debounce.check_and_unlock_achievements(session_record) {
                                        for ach in &new_achievements {
                                            let _ = app_debounce.emit("achievement-unlocked", ach.clone());
                                        }
                                    }
                                }
                            }
                            let _ = app_debounce.emit("session-ended", session_id);

                            if let Ok(status) = db_debounce.get_goals_status() {
                                let daily_seconds_needed = status.config.daily_minutes as i64 * 60;
                                if status.today_seconds >= daily_seconds_needed
                                    && status.today_seconds - duration_seconds < daily_seconds_needed
                                {
                                    let _ = app_debounce.emit("daily-goal-reached", ());
                                    use tauri_plugin_notification::NotificationExt;
                                    let _ = app_debounce.notification()
                                        .builder()
                                        .title("🎹 Daily Goal Reached!")
                                        .body(&format!("You've practiced for {} minutes today. Keep it up!", status.today_seconds / 60))
                                        .show();
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

fn try_connect_midi(session: SharedSession) -> Result<midir::MidiInputConnection<()>, Box<dyn std::error::Error + Send + Sync>> {
    let midi_in = MidiInput::new("piano-tracker")?;
    let ports = midi_in.ports();
    if ports.is_empty() {
        return Err("No MIDI ports found".into());
    }

    let port = &ports[0];
    let port_name = midi_in.port_name(port).unwrap_or_else(|_| "Unknown MIDI Device".to_string());

    {
        let mut s = session.lock().unwrap();
        s.midi_connected = true;
        s.midi_port_name = Some(port_name);
    }

    let session_cb = session.clone();
    let conn = midi_in.connect(port, "piano-tracker-input", move |_ts, _msg, _| {
        let mut s = session_cb.lock().unwrap();
        s.last_midi_instant = Some(Instant::now());
    }, ())?;

    Ok(conn)
}
