//! Recorded MIDI: the piano roll's events and `.mid` export.

use std::path::PathBuf;
use tauri::{Manager, State};
use super::{CommandResult, DbState};
use crate::db::MidiEventRecord;
use crate::midi_file;

#[tauri::command]
pub fn get_midi_events(db: State<DbState>, session_id: i64) -> CommandResult<Vec<MidiEventRecord>> {
    Ok(db.get_midi_events(session_id)?)
}

#[tauri::command]
pub fn export_midi_file(db: State<DbState>, session_id: i64) -> CommandResult<Vec<u8>> {
    Ok(midi_file::build(&db.get_midi_events(session_id)?))
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
) -> CommandResult<String> {
    let bytes = midi_file::build(&db.get_midi_events(session_id)?);

    let save_dir = db.get_setting("midi_save_folder")?
        .filter(|p| !p.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| app.path().download_dir().unwrap_or_else(|_| PathBuf::from(".")));

    std::fs::create_dir_all(&save_dir)?;
    let path = save_dir.join(file_name(&date, session_id, song_name.as_deref()));
    std::fs::write(&path, &bytes)?;
    Ok(path.to_string_lossy().to_string())
}

/// `piano-session-<date>-<song>.mid`, or the session id when there is no song.
fn file_name(date: &str, session_id: i64, song_name: Option<&str>) -> String {
    match song_name.map(str::trim).filter(|n| !n.is_empty()) {
        Some(name) => format!("piano-session-{date}-{}.mid", sanitise(name)),
        None => format!("piano-session-{date}-{session_id}.mid"),
    }
}

/// Keep letters, digits, spaces and hyphens; replace anything else with `_`.
fn sanitise(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == ' ' { c } else { '_' })
        .collect::<String>()
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_safe_file_names() {
        assert_eq!(file_name("2026-10-10", 7, Some("Für Elise: Op. 59")), "piano-session-2026-10-10-Für Elise_ Op_ 59.mid");
        assert_eq!(file_name("2026-10-10", 7, Some("  ")), "piano-session-2026-10-10-7.mid");
        assert_eq!(file_name("2026-10-10", 7, None), "piano-session-2026-10-10-7.mid");
    }
}
