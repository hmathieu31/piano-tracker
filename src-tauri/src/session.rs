use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use std::thread;
use midir::MidiInput;
use chrono::Local;
use tauri::{AppHandle, Manager};
use tauri::Emitter;
use crate::db::Database;

pub struct SessionInner {
    pub is_active: bool,
    pub start_ts: Option<i64>,
    pub last_midi_instant: Option<Instant>,
    /// Wall-clock time (ms) of the last note-on. Unlike `Instant`, this keeps
    /// moving while the machine sleeps, so it is what decides where a session
    /// really ended.
    pub last_note_ts: Option<i64>,
    pub midi_port_name: Option<String>,
    pub midi_connected: bool,
    pub midi_buffer: Vec<crate::db::MidiEventRecord>,
    /// Wall-clock time of the first note-on buffered in the current session.
    /// Used as the timing origin for relative_ms — avoids the ~500ms skew
    /// that comes from using start_ts (set by the debounce thread).
    pub midi_buffer_start: Option<Instant>,
}

/// Silence after the last note-on that ends a session.
pub const SILENCE_TIMEOUT: Duration = Duration::from_secs(10);

pub type SharedSession = Arc<Mutex<SessionInner>>;
pub type ForceReconnect = Arc<AtomicBool>;

#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionStatus {
    pub is_playing: bool,
    pub session_start_ts: Option<i64>,
    pub elapsed_seconds: i64,
    pub midi_port_name: Option<String>,
    pub midi_connected: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionEndedPayload {
    pub session_id: i64,
    pub duration_seconds: i64,
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
    force_reconnect: ForceReconnect,
) {
    let session_for_midi = session.clone();
    let session_for_debounce = session.clone();

    thread::spawn(move || {
        let mut attempt: u32 = 0;
        loop {
            attempt = attempt.wrapping_add(1);
            // Use a unique client name each attempt so WinMM doesn't reject
            // re-registration of an already-known name after a clean drop.
            match try_connect_midi(session_for_midi.clone(), attempt) {
                Ok((conn, port_name)) => {
                    // Clear any stale reconnect request that triggered this connection
                    // attempt. Without this, the first poll iteration sees forced=true
                    // and immediately disconnects the keyboard we just connected.
                    force_reconnect.store(false, Ordering::Relaxed);

                    // Poll every 1s: detect keyboard power-off OR manual reconnect request
                    loop {
                        thread::sleep(Duration::from_secs(1));
                        let forced = force_reconnect.swap(false, Ordering::Relaxed);
                        let gone = forced || MidiInput::new("piano-tracker-probe")
                            .map(|mi| mi.ports().iter()
                                .all(|p| mi.port_name(p).ok().as_deref() != Some(port_name.as_str())))
                            .unwrap_or(false); // if probe itself fails, don't falsely assume gone
                        if gone {
                            let mut s = session_for_midi.lock().unwrap();
                            s.midi_connected = false;
                            s.midi_port_name = None;
                            break;
                        }
                    }
                    drop(conn);
                    // Give WinMM time to release the port — but wake early if user
                    // manually requests reconnect.
                    for _ in 0..10 {
                        thread::sleep(Duration::from_millis(200));
                        if force_reconnect.load(Ordering::Relaxed) { break; }
                    }
                }
                Err(_) => {
                    {
                        let mut s = session_for_midi.lock().unwrap();
                        s.midi_connected = false;
                        s.midi_port_name = None;
                    }
                    // Wait up to 3s but wake early if a manual reconnect is requested
                    for _ in 0..6 {
                        thread::sleep(Duration::from_millis(500));
                        if force_reconnect.swap(false, Ordering::Relaxed) { break; }
                    }
                }
            }
        }
    });

    let db_debounce = db.clone();
    let app_debounce = app_handle.clone();
    thread::spawn(move || {
        let debounce = SILENCE_TIMEOUT;
        let debounce_ms = debounce.as_millis() as i64;
        loop {
            thread::sleep(Duration::from_millis(500));

            let (should_start, should_end, start_ts_to_save, last_note_ts, events_to_save) = {
                let mut s = session_for_debounce.lock().unwrap();
                let should_start = !s.is_active
                    && s.last_midi_instant.is_some()
                    && s.midi_connected;

                // Check the wall clock too: the monotonic clock may not advance
                // while the machine sleeps, which would delay the end after resume.
                let should_end = s.is_active && (
                    s.last_midi_instant.map(|t| t.elapsed() > debounce).unwrap_or(false)
                    || s.last_note_ts.map(|t| now_ms() - t > debounce_ms).unwrap_or(false)
                );

                if should_start {
                    s.is_active = true;
                    s.start_ts = Some(now_ms());
                    // Do NOT clear midi_buffer here — the notes that triggered
                    // this session are already in the buffer and must be kept.
                }

                let start_ts_to_save = if should_end { s.start_ts } else { None };
                let last_note_ts = if should_end { s.last_note_ts } else { None };
                let events_to_save = if should_end {
                    let ev = s.midi_buffer.clone();
                    s.midi_buffer.clear();
                    s.midi_buffer_start = None; // reset timing origin for next session
                    ev
                } else {
                    Vec::new()
                };
                if should_end {
                    s.is_active = false;
                    s.start_ts = None;
                    s.last_midi_instant = None;
                    s.last_note_ts = None;
                }

                (should_start, should_end, start_ts_to_save, last_note_ts, events_to_save)
            };

            if should_start {
                let _ = app_debounce.emit("session-started", ());
            }

            if should_end {
                if let Some(start_ts) = start_ts_to_save {
                    // End at the last note plus the silence timeout, not "now":
                    // after a sleep/resume, "now" can be hours past the last note.
                    let end_ts = last_note_ts
                        .map(|t| (t + debounce_ms).min(now_ms()))
                        .unwrap_or_else(now_ms)
                        .max(start_ts);
                    let duration_seconds = (end_ts - start_ts) / 1000;
                    let date = chrono::DateTime::from_timestamp_millis(end_ts)
                        .map(|t| t.with_timezone(&Local))
                        .unwrap_or_else(Local::now)
                        .format("%Y-%m-%d").to_string();

                    if duration_seconds >= 5 {
                        if let Ok(session_id) = db_debounce.insert_session(
                            &date, start_ts, end_ts
                        ) {
                            // Flush buffered MIDI events for this session
                            if !events_to_save.is_empty() {
                                let _ = db_debounce.insert_midi_events(session_id, &events_to_save);
                            }
                            if let Ok(Some(session_record)) = db_debounce.get_session(session_id) {
                                if let Ok(new_achievements) = db_debounce.check_and_unlock_achievements(&session_record) {
                                    for ach in &new_achievements {
                                        let _ = app_debounce.emit("achievement-unlocked", ach.clone());
                                    }
                                }
                            }
                            let _ = app_debounce.emit("session-ended", crate::session::SessionEndedPayload {
                                session_id,
                                duration_seconds,
                            });

                            // Show a Windows toast if the app isn't in the foreground,
                            // so the user knows to open it and tag the session.
                            let is_focused = app_debounce
                                .get_webview_window("main")
                                .map(|w| w.is_focused().unwrap_or(false))
                                .unwrap_or(false);
                            if !is_focused {
                                use tauri_plugin_notification::NotificationExt;
                                let mins = duration_seconds / 60;
                                let secs = duration_seconds % 60;
                                let duration_str = if mins > 0 && secs > 0 {
                                    format!("{}m {}s", mins, secs)
                                } else if mins > 0 {
                                    format!("{}m", mins)
                                } else {
                                    format!("{}s", secs)
                                };
                                let _ = app_debounce.notification()
                                    .builder()
                                    .title("🎹 Practice session saved!")
                                    .body(&format!(
                                        "You practiced for {}. Open Piano Tracker to tag it with a song.",
                                        duration_str
                                    ))
                                    .show();
                            }

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

fn try_connect_midi(session: SharedSession, attempt: u32) -> Result<(midir::MidiInputConnection<()>, String), Box<dyn std::error::Error + Send + Sync>> {
    // Try up to 3 times with short delays — WinMM sometimes needs a moment
    // to fully register a keyboard that was just powered on.
    let mut last_err: Box<dyn std::error::Error + Send + Sync> = "No MIDI ports found".into();
    for sub in 0..3u32 {
        if sub > 0 {
            thread::sleep(Duration::from_millis(400));
        }
        match try_connect_once(session.clone(), attempt * 10 + sub) {
            Ok(result) => return Ok(result),
            Err(e) => { last_err = e; }
        }
    }
    Err(last_err)
}

fn try_connect_once(session: SharedSession, client_id: u32) -> Result<(midir::MidiInputConnection<()>, String), Box<dyn std::error::Error + Send + Sync>> {
    // Unique client name per attempt avoids WinMM rejecting re-registration
    // of a name it still considers active after a previous drop.
    let client_name = format!("piano-tracker-{}", client_id);
    let midi_in = MidiInput::new(&client_name)?;
    let ports = midi_in.ports();
    if ports.is_empty() {
        return Err("No MIDI ports found".into());
    }

    let port = &ports[0];
    let port_name = midi_in.port_name(port).unwrap_or_else(|_| "Unknown MIDI Device".to_string());

    {
        let mut s = session.lock().unwrap();
        s.midi_connected = true;
        s.midi_port_name = Some(port_name.clone());
        // If a session is still running (e.g. the keyboard dropped and came back
        // after a sleep), keep its state so the debounce thread can end it.
        // Clearing last_midi_instant here used to leave it active with nothing
        // to time out on, so it only ended after the next note, hours later.
        if !s.is_active {
            s.last_midi_instant = None;
            s.last_note_ts = None;
            s.midi_buffer.clear();
            s.midi_buffer_start = None;
        }
    }

    let session_cb = session.clone();
    let conn = midi_in.connect(port, "piano-tracker-input", move |_ts, msg, _| {
        if msg.is_empty() { return; }
        let status = msg[0];
        // note-on (0x90–0x9F) with velocity > 0
        let is_note_on  = (status & 0xF0) == 0x90 && msg.len() >= 3 && msg[2] > 0;
        // note-off (0x80–0x8F) or note-on with velocity 0
        let is_note_off = ((status & 0xF0) == 0x80 && msg.len() >= 3)
                       || ((status & 0xF0) == 0x90 && msg.len() >= 3 && msg[2] == 0);
        // Sustain pedal and all other CC (0xBx) are intentionally excluded here.

        if is_note_on || is_note_off {
            let now = Instant::now();
            let mut s = session_cb.lock().unwrap();
            if is_note_on {
                s.last_midi_instant = Some(now);
                s.last_note_ts = Some(now_ms());
            }
            // Use wall-clock delta from the very first buffered note as the
            // timing origin. This avoids the ≤500ms skew from start_ts, which
            // is set by the debounce thread after the first note is played.
            let first = *s.midi_buffer_start.get_or_insert(now);
            let relative_ms = now.duration_since(first).as_millis() as i64;
            // Normalize note-off velocity to 0 regardless of whether the
            // keyboard sent 0x8x with release velocity or 0x90 vel=0.
            // build_midi_file distinguishes note-on vs note-off by velocity==0,
            // so a non-zero release velocity would be misread as a note-on.
            let velocity = if is_note_off { 0 } else { if msg.len() > 2 { msg[2] } else { 0 } };
            s.midi_buffer.push(crate::db::MidiEventRecord {
                relative_ms,
                note: if msg.len() > 1 { msg[1] } else { 0 },
                velocity,
                channel: status & 0x0F,
            });
        }
    }, ())?;

    Ok((conn, port_name))
}

/// Daily cleanup: crop saved sessions that ran on long after the last note
/// (see `Database::crop_runaway_sessions`). The first pass runs before the UI
/// loads its data, then it repeats once per day.
pub fn start_session_cropper(db: Arc<Database>) {
    let silence_ms = SILENCE_TIMEOUT.as_millis() as i64;
    let _ = db.crop_runaway_sessions(silence_ms);
    thread::spawn(move || {
        let mut last_run_date = Local::now().format("%Y-%m-%d").to_string();
        loop {
            thread::sleep(Duration::from_secs(3600));
            let today = Local::now().format("%Y-%m-%d").to_string();
            if today != last_run_date && db.crop_runaway_sessions(silence_ms).is_ok() {
                last_run_date = today;
            }
        }
    });
}
