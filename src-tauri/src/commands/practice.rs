//! Live practice state and the session log.

use tauri::State;
use super::{CommandResult, DbState};
use crate::db::{MasterySuggestion, SessionRecord};
use crate::practice::{ForceReconnect, SessionStatus, SharedSession};

#[tauri::command]
pub fn get_session_status(session: State<SharedSession>) -> SessionStatus {
    crate::practice::get_status(&session)
}

#[tauri::command]
pub fn reconnect_midi(force_reconnect: State<ForceReconnect>) {
    force_reconnect.store(true, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
pub fn get_sessions(db: State<DbState>, limit: i32) -> CommandResult<Vec<SessionRecord>> {
    Ok(db.get_sessions(limit)?)
}

#[tauri::command]
pub fn get_sessions_for_song(db: State<DbState>, song_id: i64) -> CommandResult<Vec<SessionRecord>> {
    Ok(db.get_sessions_for_song(song_id)?)
}

#[tauri::command]
pub fn update_session_note(db: State<DbState>, id: i64, note: String) -> CommandResult<()> {
    Ok(db.update_session_note(id, &note)?)
}

#[tauri::command]
pub fn set_session_feeling(db: State<DbState>, session_id: i64, feeling: Option<i64>) -> CommandResult<()> {
    Ok(db.set_session_feeling(session_id, feeling)?)
}

#[tauri::command]
pub fn link_session_song(db: State<DbState>, session_id: i64, song_id: i64) -> CommandResult<()> {
    Ok(db.link_session_song(session_id, song_id)?)
}

#[tauri::command]
pub fn unlink_session_song(db: State<DbState>, session_id: i64) -> CommandResult<()> {
    Ok(db.unlink_session_song(session_id)?)
}

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
) -> CommandResult<Option<MasterySuggestion>> {
    Ok(db.tag_session(session_id, song_id, feeling, practice_type.as_deref(), note.as_deref())?)
}
