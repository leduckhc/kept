use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// Shared state: total unread count for badge/tray tooltip updates.
pub struct UnreadState(pub Mutex<u32>);

/// Called from the frontend to update the tray tooltip with the current
/// unread count.  On macOS we also set the dock badge.
#[tauri::command]
fn update_unread_badge(app: tauri::AppHandle, count: u32) {
    // Store in state so future tray rebuilds can read it
    if let Some(state) = app.try_state::<UnreadState>() {
        *state.0.lock().unwrap() = count;
    }

    // Update the tray tooltip (works on all platforms)
    let label = if count == 0 {
        "Kept".to_string()
    } else {
        format!("Kept — {} unread", count)
    };
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_tooltip(Some(&label));
    }

    // macOS dock badge
    #[cfg(target_os = "macos")]
    {
        let badge = if count == 0 {
            None
        } else {
            Some(count.to_string())
        };
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_badge_label(badge);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_keyring::init())
        .manage(UnreadState(Mutex::new(0)))
        .invoke_handler(tauri::generate_handler![update_unread_badge])
        .setup(|app: &mut tauri::App| {
            // ── tauri-pilot (debug builds only) ─────────────────────
            #[cfg(debug_assertions)]
            {
                app.handle().plugin(tauri_plugin_pilot::init())?;
            }
            // ── App menu ──────────────────────────────────────────
            let app_submenu = SubmenuBuilder::new(app, "Kept")
                .item(&PredefinedMenuItem::about(app, Some("About Kept"), None)?)
                .separator()
                .item(&PredefinedMenuItem::services(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(app, None)?)
                .item(&PredefinedMenuItem::hide_others(app, None)?)
                .item(&PredefinedMenuItem::show_all(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, None)?)
                .build()?;

            let sync_item = MenuItemBuilder::with_id("sync", "Sync")
                .accelerator("CmdOrCtrl+R")
                .build(app)?;
            let settings_item = MenuItemBuilder::with_id("settings", "Settings…")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let file_submenu = SubmenuBuilder::new(app, "File")
                .item(&sync_item)
                .separator()
                .item(&settings_item)
                .build()?;

            let edit_submenu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;

            let window_submenu = SubmenuBuilder::new(app, "Window")
                .item(&PredefinedMenuItem::minimize(app, None)?)
                .item(&PredefinedMenuItem::maximize(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::fullscreen(app, None)?)
                .build()?;

            let menu = Menu::with_items(app, &[
                &app_submenu,
                &file_submenu,
                &edit_submenu,
                &window_submenu,
            ])?;
            app.set_menu(menu)?;

            // Handle custom menu events
            app.on_menu_event(move |app_handle, event| {
                match event.id().as_ref() {
                    "sync" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.eval("window.__kept_sync && window.__kept_sync()");
                        }
                    }
                    "settings" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.eval("window.__kept_settings && window.__kept_settings()");
                        }
                    }
                    _ => {}
                }
            });

            // ── Tray icon ─────────────────────────────────────────
            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Kept")
                .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event: TrayIconEvent| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
