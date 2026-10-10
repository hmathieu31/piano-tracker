//! System tray icon and menu.

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Listener, Manager};

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Build the tray icon; its tooltip follows the `session-started` and
/// `session-ended` events.
pub fn setup(app: &App) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .item(&MenuItemBuilder::new("Open Dashboard").id("open").build(app)?)
        .separator()
        .item(&MenuItemBuilder::new("Restart").id("restart").build(app)?)
        .item(&MenuItemBuilder::new("Quit").id("quit").build(app)?)
        .build()?;

    let tray = TrayIconBuilder::new()
        .menu(&menu)
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Ivory — Not playing")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "restart" => app.restart(),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Only toggle the window on left-click; right-click opens the menu.
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let app = tray.app_handle();
                match app.get_webview_window("main") {
                    Some(window) if window.is_visible().unwrap_or(false) => { let _ = window.hide(); }
                    Some(_) => show_main_window(app),
                    None => {}
                }
            }
        })
        .build(app)?;

    for (event, tooltip) in [("session-started", "Ivory — 🎹 Playing..."), ("session-ended", "Ivory — Not playing")] {
        let tray = tray.clone();
        app.listen(event, move |_| { let _ = tray.set_tooltip(Some(tooltip)); });
    }
    Ok(())
}
