//! Turns the notes buffered by `midi_input` into saved sessions.

use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use crate::db::{Database, MidiEventRecord};
use crate::notifications::notify;
use crate::time::{format_duration, local_day, now_ms};
use super::{SessionEndedPayload, SessionInner, SharedSession, SILENCE_TIMEOUT};

/// Sessions shorter than this are discarded.
const MIN_SESSION_SECONDS: i64 = 5;

/// A session that just went silent, taken out of the shared state.
struct Ended {
    start_ts: i64,
    last_note_ts: Option<i64>,
    events: Vec<MidiEventRecord>,
}

enum Tick {
    Idle,
    Started,
    Ended(Ended),
}

impl SessionInner {
    /// Advance the session state: start on the first note, end after
    /// `SILENCE_TIMEOUT` without one.
    fn tick(&mut self) -> Tick {
        let silence_ms = SILENCE_TIMEOUT.as_millis() as i64;
        if !self.is_active {
            if self.last_midi_instant.is_some() && self.midi_connected {
                self.is_active = true;
                self.start_ts = Some(now_ms());
                // The notes that triggered this session stay in the buffer.
                return Tick::Started;
            }
            return Tick::Idle;
        }
        // Check the wall clock too: the monotonic clock may not advance while
        // the machine sleeps, which would delay the end after resume.
        let silent = self.last_midi_instant.is_some_and(|t| t.elapsed() > SILENCE_TIMEOUT)
            || self.last_note_ts.is_some_and(|t| now_ms() - t > silence_ms);
        if !silent {
            return Tick::Idle;
        }
        let ended = self.start_ts.take().map(|start_ts| Ended {
            start_ts,
            last_note_ts: self.last_note_ts,
            events: std::mem::take(&mut self.midi_buffer),
        });
        self.is_active = false;
        self.last_midi_instant = None;
        self.last_note_ts = None;
        self.midi_buffer.clear();
        self.midi_buffer_start = None;
        ended.map_or(Tick::Idle, Tick::Ended)
    }
}

pub fn start_recorder(app: AppHandle, db: Arc<Database>, session: SharedSession) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(500));
        let tick = session.lock().unwrap().tick();
        match tick {
            Tick::Idle => {}
            Tick::Started => { let _ = app.emit("session-started", ()); }
            Tick::Ended(ended) => save_session(&app, &db, ended),
        }
    });
}

fn save_session(app: &AppHandle, db: &Database, ended: Ended) {
    // End at the last note plus the silence timeout, not "now": after a
    // sleep/resume, "now" can be hours past the last note.
    let silence_ms = SILENCE_TIMEOUT.as_millis() as i64;
    let end_ts = ended.last_note_ts
        .map(|t| (t + silence_ms).min(now_ms()))
        .unwrap_or_else(now_ms)
        .max(ended.start_ts);
    let duration_seconds = (end_ts - ended.start_ts) / 1000;
    if duration_seconds < MIN_SESSION_SECONDS {
        return;
    }
    let Ok(session_id) = db.insert_session(&local_day(end_ts), ended.start_ts, end_ts) else { return };
    if !ended.events.is_empty() {
        let _ = db.insert_midi_events(session_id, &ended.events);
    }

    if let Ok(Some(record)) = db.get_session(session_id) {
        for key in db.check_and_unlock_achievements(&record).unwrap_or_default() {
            let _ = app.emit("achievement-unlocked", key);
        }
    }
    let _ = app.emit("session-ended", SessionEndedPayload { session_id, duration_seconds });

    // Toast when the app isn't in the foreground, so the user knows to open it
    // and tag the session.
    let focused = app.get_webview_window("main").is_some_and(|w| w.is_focused().unwrap_or(false));
    if !focused {
        notify(
            app,
            "🎹 Practice session saved!",
            &format!(
                "You practiced for {}. Open Piano Tracker to tag it with a song.",
                format_duration(duration_seconds)
            ),
        );
    }

    if let Ok(status) = db.get_goals_status() {
        let goal_seconds = status.config.daily_minutes as i64 * 60;
        // Only the session that crosses the goal celebrates it.
        if status.today_seconds >= goal_seconds && status.today_seconds - duration_seconds < goal_seconds {
            let _ = app.emit("daily-goal-reached", ());
            notify(
                app,
                "🎹 Daily Goal Reached!",
                &format!("You've practiced for {} minutes today. Keep it up!", status.today_seconds / 60),
            );
        }
    }
}
