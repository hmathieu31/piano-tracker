//! Keyboard connection: finds the first MIDI input, buffers the notes played
//! and reconnects when the keyboard is unplugged or a reconnect is requested.

use std::sync::atomic::Ordering;
use std::thread;
use std::time::{Duration, Instant};
use midir::{MidiInput, MidiInputConnection};
use crate::db::MidiEventRecord;
use crate::time::now_ms;
use super::{ForceReconnect, SessionInner, SharedSession};

type BoxError = Box<dyn std::error::Error + Send + Sync>;

/// A note-on or note-off from the keyboard. A note-off has velocity 0.
#[derive(Debug, PartialEq)]
struct Note {
    on: bool,
    note: u8,
    velocity: u8,
    channel: u8,
}

/// Read a note message; anything else (sustain pedal, other controllers,
/// clock) is ignored.
fn parse_note(msg: &[u8]) -> Option<Note> {
    let [status, note, velocity, ..] = *msg else { return None };
    let channel = status & 0x0F;
    match status & 0xF0 {
        0x90 if velocity > 0 => Some(Note { on: true, note, velocity, channel }),
        // Note-off velocity is normalized to 0: the MIDI export tells note-on
        // from note-off by velocity, so a release velocity would read as a note-on.
        0x90 | 0x80 => Some(Note { on: false, note, velocity: 0, channel }),
        _ => None,
    }
}

impl SessionInner {
    fn record_note(&mut self, n: Note, now: Instant) {
        if n.on {
            self.last_midi_instant = Some(now);
            self.last_note_ts = Some(now_ms());
        }
        let first = *self.midi_buffer_start.get_or_insert(now);
        self.midi_buffer.push(MidiEventRecord {
            relative_ms: now.duration_since(first).as_millis() as i64,
            note: n.note,
            velocity: n.velocity,
            channel: n.channel,
        });
    }
}

/// Sleep up to `steps` × `step`, waking early when a reconnect is requested.
/// With `consume`, the request is cleared when it wakes us.
fn sleep_unless_reconnect(force: &ForceReconnect, steps: u32, step: Duration, consume: bool) {
    for _ in 0..steps {
        thread::sleep(step);
        let requested = if consume { force.swap(false, Ordering::Relaxed) } else { force.load(Ordering::Relaxed) };
        if requested {
            break;
        }
    }
}

fn port_is_present(port_name: &str) -> bool {
    MidiInput::new("piano-tracker-probe")
        .map(|mi| mi.ports().iter().any(|p| mi.port_name(p).ok().as_deref() == Some(port_name)))
        // If the probe itself fails, don't falsely assume the keyboard is gone.
        .unwrap_or(true)
}

pub fn start_midi_listener(session: SharedSession, force_reconnect: ForceReconnect) {
    thread::spawn(move || {
        let mut attempt: u32 = 0;
        loop {
            attempt = attempt.wrapping_add(1);
            match try_connect(session.clone(), attempt) {
                Ok((conn, port_name)) => {
                    // Clear any stale reconnect request that triggered this connection
                    // attempt. Without this, the first poll iteration sees it and
                    // immediately disconnects the keyboard we just connected.
                    force_reconnect.store(false, Ordering::Relaxed);

                    // Poll every 1s: detect keyboard power-off OR manual reconnect request
                    loop {
                        thread::sleep(Duration::from_secs(1));
                        let forced = force_reconnect.swap(false, Ordering::Relaxed);
                        if forced || !port_is_present(&port_name) {
                            session.lock().unwrap().set_disconnected();
                            break;
                        }
                    }
                    drop(conn);
                    // Give WinMM time to release the port.
                    sleep_unless_reconnect(&force_reconnect, 10, Duration::from_millis(200), false);
                }
                Err(_) => {
                    session.lock().unwrap().set_disconnected();
                    sleep_unless_reconnect(&force_reconnect, 6, Duration::from_millis(500), true);
                }
            }
        }
    });
}

/// Try up to 3 times with short delays: WinMM sometimes needs a moment to
/// fully register a keyboard that was just powered on.
fn try_connect(session: SharedSession, attempt: u32) -> Result<(MidiInputConnection<()>, String), BoxError> {
    let mut last_err: BoxError = "No MIDI ports found".into();
    for sub in 0..3u32 {
        if sub > 0 {
            thread::sleep(Duration::from_millis(400));
        }
        match connect_once(session.clone(), attempt * 10 + sub) {
            Ok(result) => return Ok(result),
            Err(e) => last_err = e,
        }
    }
    Err(last_err)
}

fn connect_once(session: SharedSession, client_id: u32) -> Result<(MidiInputConnection<()>, String), BoxError> {
    // Unique client name per attempt avoids WinMM rejecting re-registration
    // of a name it still considers active after a previous drop.
    let midi_in = MidiInput::new(&format!("piano-tracker-{client_id}"))?;
    let ports = midi_in.ports();
    let port = ports.first().ok_or("No MIDI ports found")?;
    let port_name = midi_in.port_name(port).unwrap_or_else(|_| "Unknown MIDI Device".to_string());

    {
        let mut s = session.lock().unwrap();
        s.midi_connected = true;
        s.midi_port_name = Some(port_name.clone());
        // If a session is still running (e.g. the keyboard dropped and came back
        // after a sleep), keep its state so the recorder can end it. Clearing
        // last_midi_instant here used to leave it active with nothing to time
        // out on, so it only ended after the next note, hours later.
        if !s.is_active {
            s.last_midi_instant = None;
            s.last_note_ts = None;
            s.midi_buffer.clear();
            s.midi_buffer_start = None;
        }
    }

    let conn = midi_in.connect(port, "piano-tracker-input", move |_ts, msg, _| {
        if let Some(note) = parse_note(msg) {
            session.lock().unwrap().record_note(note, Instant::now());
        }
    }, ()).map_err(|e| e.to_string())?;

    Ok((conn, port_name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_note_messages() {
        assert_eq!(parse_note(&[0x91, 60, 80]), Some(Note { on: true, note: 60, velocity: 80, channel: 1 }));
        // Note-on with velocity 0 and note-off with a release velocity are both note-offs.
        assert_eq!(parse_note(&[0x90, 60, 0]), Some(Note { on: false, note: 60, velocity: 0, channel: 0 }));
        assert_eq!(parse_note(&[0x80, 60, 64]), Some(Note { on: false, note: 60, velocity: 0, channel: 0 }));
        // Sustain pedal, short messages and clock are ignored.
        assert_eq!(parse_note(&[0xB0, 64, 127]), None);
        assert_eq!(parse_note(&[0x90, 60]), None);
        assert_eq!(parse_note(&[0xF8]), None);
    }
}
