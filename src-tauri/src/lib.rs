use std::sync::Mutex;
use tauri::Manager;

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

/// Shared state: total unread count for badge/tray tooltip updates.
pub struct UnreadState(pub Mutex<u32>);

/// Toggle background dispatch: install/uninstall the OS scheduler entry.
#[tauri::command]
fn toggle_background_dispatch(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").map_err(|e| e.to_string())?;
        let plist_dir = std::path::Path::new(&home).join("Library/LaunchAgents");
        let plist_path = plist_dir.join("com.kept.dispatch.plist");

        if enabled {
            let dispatch_bin = std::env::current_exe()
                .map_err(|e| e.to_string())?
                .parent()
                .ok_or("no parent dir".to_string())?
                .join("kept-dispatch");

            let plist_content =
                include_str!("../../crates/kept-dispatch/resources/com.kept.dispatch.plist")
                    .replace("__KEPT_DISPATCH_PATH__", &dispatch_bin.to_string_lossy());

            std::fs::create_dir_all(&plist_dir).map_err(|e| e.to_string())?;
            std::fs::write(&plist_path, plist_content).map_err(|e| e.to_string())?;

            std::process::Command::new("launchctl")
                .args(["load", "-w"])
                .arg(&plist_path)
                .output()
                .map_err(|e| e.to_string())?;
        } else if plist_path.exists() {
            let _ = std::process::Command::new("launchctl")
                .args(["unload"])
                .arg(&plist_path)
                .output();
            std::fs::remove_file(&plist_path).map_err(|e| e.to_string())?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").map_err(|e| e.to_string())?;
        let timer_dir = std::path::Path::new(&home).join(".config/systemd/user");
        let timer_path = timer_dir.join("kept-dispatch.timer");
        let service_path = timer_dir.join("kept-dispatch.service");

        if enabled {
            let dispatch_bin = std::env::current_exe()
                .map_err(|e| e.to_string())?
                .parent()
                .ok_or("no parent dir".to_string())?
                .join("kept-dispatch");

            std::fs::create_dir_all(&timer_dir).map_err(|e| e.to_string())?;

            let service = format!(
                "[Unit]\nDescription=Kept background dispatch\n\n[Service]\nType=oneshot\nExecStart={}\n",
                dispatch_bin.to_string_lossy()
            );
            let timer = "[Unit]\nDescription=Kept dispatch timer\n\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=5min\n\n[Install]\nWantedBy=timers.target\n";

            std::fs::write(&service_path, service).map_err(|e| e.to_string())?;
            std::fs::write(&timer_path, timer).map_err(|e| e.to_string())?;

            std::process::Command::new("systemctl")
                .args(["--user", "enable", "--now", "kept-dispatch.timer"])
                .output()
                .map_err(|e| e.to_string())?;
        } else {
            let _ = std::process::Command::new("systemctl")
                .args(["--user", "disable", "--now", "kept-dispatch.timer"])
                .output();
            let _ = std::fs::remove_file(&timer_path);
            let _ = std::fs::remove_file(&service_path);
        }
    }

    #[cfg(target_os = "windows")]
    {
        let _ = enabled;
    }

    Ok(())
}

/// Called from the frontend to update the tray tooltip with the current
/// unread count.  On macOS we also set the dock badge.
#[tauri::command]
fn update_unread_badge(app: tauri::AppHandle, count: u32) {
    // Store in state so future tray rebuilds can read it
    if let Some(state) = app.try_state::<UnreadState>() {
        *state.0.lock().unwrap() = count;
    }

    // Update the tray tooltip (desktop only)
    #[cfg(desktop)]
    {
        let label = if count == 0 {
            "Kept".to_string()
        } else {
            format!("Kept — {} unread", count)
        };
        if let Some(tray) = app.tray_by_id("main-tray") {
            let _ = tray.set_tooltip(Some(&label));
        }
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
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_notification::init());

    // Keyring plugin — desktop only (no iOS support)
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_keyring::init());

    builder
        .manage(UnreadState(Mutex::new(0)))
        .invoke_handler(tauri::generate_handler![update_unread_badge, toggle_background_dispatch])
        .setup(|app: &mut tauri::App| {
            // ── tauri-pilot (debug builds, desktop only) ─────────────
            #[cfg(all(debug_assertions, desktop))]
            {
                app.handle().plugin(tauri_plugin_pilot::init())?;
            }

            // ── App menu + Tray (desktop only) ───────────────────────
            #[cfg(desktop)]
            {
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
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
