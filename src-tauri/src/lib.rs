mod commands;
mod db;
mod midi_file;
mod notifications;
mod practice;
mod time;
mod tray;
mod updater;

use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use commands::DbState;
use practice::{ForceReconnect, SharedSession};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db = Arc::new(db::Database::new(&app_data_dir.join("piano-tracker.db"))?);
            db.init()?;

            let session: SharedSession = Arc::new(Mutex::new(Default::default()));
            let force_reconnect: ForceReconnect = Arc::new(AtomicBool::new(false));
            app.manage(db.clone() as DbState);
            app.manage(session.clone());
            app.manage(force_reconnect.clone());
            app.manage(updater::PendingUpdate::default());

            practice::start_midi_listener(session.clone(), force_reconnect);
            practice::start_recorder(app.handle().clone(), db.clone(), session);
            practice::start_session_cropper(db.clone());
            notifications::start_notification_scheduler(app.handle().clone(), db);

            tray::setup(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Practice and sessions
            commands::practice::get_session_status,
            commands::practice::reconnect_midi,
            commands::practice::get_sessions,
            commands::practice::get_sessions_for_song,
            commands::practice::update_session_note,
            commands::practice::set_session_feeling,
            commands::practice::link_session_song,
            commands::practice::unlink_session_song,
            commands::practice::tag_session,
            // Updates
            updater::check_for_update,
            updater::install_update,
            // Song catalog and mastery
            commands::songs::create_song,
            commands::songs::update_song_genre,
            commands::songs::update_song_difficulty,
            commands::songs::get_songs,
            commands::songs::get_song_stats,
            commands::songs::get_all_songs_with_stats,
            commands::songs::get_recent_songs,
            commands::songs::get_song_with_sessions,
            commands::songs::set_song_status,
            commands::songs::confirm_mastery_advance,
            // Stats, goals, achievements and settings
            commands::stats::get_daily_totals,
            commands::stats::get_streak,
            commands::stats::get_insights,
            commands::stats::get_goals,
            commands::stats::set_goal,
            commands::stats::get_goals_status,
            commands::stats::get_achievements,
            commands::stats::get_setting,
            commands::stats::set_setting,
            // MIDI
            commands::midi::get_midi_events,
            commands::midi::export_midi_file,
            commands::midi::save_midi_file,
            // Dev / demo data
            commands::dev::seed_dev_data,
            commands::dev::clear_dev_data,
            commands::dev::dev_simulate_session_ended,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
