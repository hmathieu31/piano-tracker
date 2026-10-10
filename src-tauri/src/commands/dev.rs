//! Development helpers behind the dev toolbar.

use tauri::{Emitter, State};
use super::{CommandResult, DbState};
use crate::practice::SessionEndedPayload;
use crate::time::{local_day, now_ms};

#[tauri::command]
pub fn seed_dev_data(db: State<DbState>) -> CommandResult<bool> {
    Ok(db.seed_dev_data()?)
}

#[tauri::command]
pub fn clear_dev_data(db: State<DbState>) -> CommandResult<()> {
    Ok(db.clear_dev_data()?)
}

/// Insert a fake session, tag it with the Up next song like a real one, and
/// emit `session-ended` so the after-session toast appears.
#[tauri::command]
pub fn dev_simulate_session_ended(
    app: tauri::AppHandle,
    db: State<DbState>,
    duration_seconds: i64,
) -> CommandResult<()> {
    let end = now_ms();
    let session_id = db.insert_session(&local_day(end), end - duration_seconds * 1000, end)?;
    db.apply_up_next(session_id)?;
    app.emit("session-ended", SessionEndedPayload { session_id, duration_seconds })?;
    Ok(())
}
