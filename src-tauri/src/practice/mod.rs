//! Live practice tracking.
//!
//! - `midi_input` keeps a connection to the keyboard and buffers the notes played.
//! - `recorder` turns those notes into sessions: it starts one on the first
//!   note and saves it after `SILENCE_TIMEOUT` without a note.
//! - `cropper` repairs saved sessions that ran on past their last note.

mod cropper;
mod midi_input;
mod recorder;

use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use serde::Serialize;
use crate::db::MidiEventRecord;
use crate::time::now_ms;

pub use cropper::start_session_cropper;
pub use midi_input::start_midi_listener;
pub use recorder::start_recorder;

/// Silence after the last note-on that ends a session.
pub const SILENCE_TIMEOUT: Duration = Duration::from_secs(10);

/// State shared by the MIDI callback, the recorder and the UI.
#[derive(Default)]
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
    pub midi_buffer: Vec<MidiEventRecord>,
    /// Time of the first note buffered in the current session: the timing
    /// origin for `relative_ms`. Avoids the ~500ms skew that comes from using
    /// `start_ts`, which the recorder sets after the first note.
    pub midi_buffer_start: Option<Instant>,
}

impl SessionInner {
    fn set_disconnected(&mut self) {
        self.midi_connected = false;
        self.midi_port_name = None;
    }
}

pub type SharedSession = Arc<Mutex<SessionInner>>;

/// Set to ask the MIDI listener to drop and re-open the keyboard connection.
pub type ForceReconnect = Arc<AtomicBool>;

#[derive(Debug, Clone, Serialize)]
pub struct SessionStatus {
    pub is_playing: bool,
    pub session_start_ts: Option<i64>,
    pub elapsed_seconds: i64,
    pub midi_port_name: Option<String>,
    pub midi_connected: bool,
}

/// Payload of the `session-ended` event.
#[derive(Debug, Clone, Serialize)]
pub struct SessionEndedPayload {
    pub session_id: i64,
    pub duration_seconds: i64,
}

pub fn get_status(session: &SharedSession) -> SessionStatus {
    let s = session.lock().unwrap();
    let elapsed_seconds = match (s.is_active, s.start_ts) {
        (true, Some(start)) => (now_ms() - start) / 1000,
        _ => 0,
    };
    SessionStatus {
        is_playing: s.is_active,
        session_start_ts: s.start_ts,
        elapsed_seconds,
        midi_port_name: s.midi_port_name.clone(),
        midi_connected: s.midi_connected,
    }
}
