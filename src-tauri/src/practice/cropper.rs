use std::sync::Arc;
use std::thread;
use std::time::Duration;
use crate::db::Database;
use crate::time::{day_key, today};
use super::SILENCE_TIMEOUT;

/// Daily cleanup: crop saved sessions that ran on long after the last note
/// (see `Database::crop_runaway_sessions`). The first pass runs before the UI
/// loads its data, then it repeats once per day.
pub fn start_session_cropper(db: Arc<Database>) {
    let silence_ms = SILENCE_TIMEOUT.as_millis() as i64;
    let _ = db.crop_runaway_sessions(silence_ms);
    thread::spawn(move || {
        let mut last_run = day_key(today());
        loop {
            thread::sleep(Duration::from_secs(3600));
            let day = day_key(today());
            if day != last_run && db.crop_runaway_sessions(silence_ms).is_ok() {
                last_run = day;
            }
        }
    });
}
