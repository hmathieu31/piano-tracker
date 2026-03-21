mod db;
mod session;
mod commands;
mod notifications;

use std::sync::Arc;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Listener,
    Manager,
};
use session::{SharedSession, SessionInner, ForceReconnect, start_midi_listener};
use commands::DbState;

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
            let db_path = app_data_dir.join("piano-tracker.db");

            let db = Arc::new(db::Database::new(&db_path).map_err(|e| e.to_string())?);
            db.init().map_err(|e| e.to_string())?;

            let session: SharedSession = Arc::new(std::sync::Mutex::new(SessionInner {
                is_active: false,
                start_ts: None,
                last_midi_instant: None,
                midi_port_name: None,
                midi_connected: false,
                midi_buffer: Vec::new(),
                midi_buffer_start: None,
            }));

            app.manage(db.clone() as DbState);
            app.manage(session.clone());

            let force_reconnect: ForceReconnect = Arc::new(std::sync::atomic::AtomicBool::new(false));
            app.manage(force_reconnect.clone());

            start_midi_listener(app.handle().clone(), db.clone(), session.clone(), force_reconnect);
            notifications::start_notification_scheduler(app.handle().clone(), db.clone());

            let open_item = MenuItemBuilder::new("Open Dashboard").id("open").build(app)?;
            let quit_item = MenuItemBuilder::new("Quit").id("quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&open_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let tray = TrayIconBuilder::new()
                .menu(&menu)
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Piano Tracker — Not playing")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Only toggle window on left-click; right-click is reserved for the context menu
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            let tray_handle = tray.clone();
            app.listen("session-started", move |_| {
                let _ = tray_handle.set_tooltip(Some("Piano Tracker — 🎹 Playing..."));
            });

            let tray_handle2 = tray;
            app.listen("session-ended", move |_| {
                let _ = tray_handle2.set_tooltip(Some("Piano Tracker — Not playing"));
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_session_status,
            commands::get_sessions,
            commands::get_daily_totals,
            commands::get_goals,
            commands::set_goal,
            commands::get_streak,
            commands::get_insights,
            commands::get_goals_status,
            commands::get_achievements,
            commands::update_session_note,
            commands::get_setting,
            commands::set_setting,
            commands::reconnect_midi,
            // Song management
            commands::create_song,
            commands::update_song_genre,
            commands::get_songs,
            commands::get_song_stats,
            commands::get_recent_songs,
            commands::link_session_song,
            commands::unlink_session_song,
            commands::get_sessions_for_song,
            // MIDI events
            commands::get_midi_events,
            commands::export_midi_file,
            commands::save_midi_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
