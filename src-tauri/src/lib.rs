/// TokenSense — macOS menu-bar-only app for monitoring Claude.ai usage.
///
/// Module layout:
///   auth       — login window + keychain credential helpers
///   commands   — Tauri commands exposed to the frontend
///   keychain   — thin keyring wrapper
///   models     — UsageData and related types
///   poller     — background JS-injection polling loop

pub mod auth;
pub mod commands;
pub mod keychain;
pub mod models;
pub mod poller;

use std::sync::{Arc, Mutex};

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

use commands::{
    disconnect, get_usage, is_connected, open_login_window, retry_connect, update_usage_from_js,
};

// ---------------------------------------------------------------------------
// Shared application state
// ---------------------------------------------------------------------------

/// Thread-safe application state shared across all Tauri commands.
pub struct AppState {
    /// Most-recently-fetched usage data for every organisation.
    pub orgs: Mutex<Vec<models::OrgUsage>>,
    /// Whether we have received at least one successful usage response.
    pub connected: Mutex<bool>,
}

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(AppState {
        orgs: Mutex::new(Vec::new()),
        connected: Mutex::new(false),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::clone(&state))
        .invoke_handler(tauri::generate_handler![
            get_usage,
            open_login_window,
            is_connected,
            disconnect,
            update_usage_from_js,
            retry_connect,
        ])
        .setup(|app| {
            // Hide from Dock — this is a menu-bar-only app.
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            setup_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tokensense application");
}

// ---------------------------------------------------------------------------
// System tray setup
// ---------------------------------------------------------------------------

fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Right-click context menu — just Quit, since left-click opens the panel.
    let quit = MenuItemBuilder::with_id("quit", "Quit TokenSense").build(app)?;
    let menu = MenuBuilder::new(app).item(&quit).build()?;

    let icon = load_tray_icon(app);

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)  // Left-click opens our panel, NOT the menu.
        .tooltip("TokenSense")
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "quit" {
                app.exit(0);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                position,
                ..
            } = event
            {
                show_at_tray(tray.app_handle(), position);
            }
        })
        .build(app)?;

    // Auto-hide the main window when it loses focus (standard menu-bar popover behaviour).
    if let Some(main_win) = app.get_webview_window("main") {
        let w = main_win.clone();
        main_win.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                let _ = w.hide();
            }
        });
    }

    Ok(())
}

/// Loads the tray icon image. Tries the bundled app icon first; uses a
/// minimal embedded PNG as a fallback so development builds don't panic.
fn load_tray_icon(app: &tauri::App) -> Image<'static> {
    if let Ok(resource_path) = app
        .path()
        .resource_dir()
        .map(|p| p.join("icons/32x32.png"))
    {
        if let Ok(img) = Image::from_path(&resource_path) {
            return img;
        }
    }

    // Minimal 1×1 white PNG as a compile-time fallback.
    const FALLBACK_PNG: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
        0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
        0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
        0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    Image::from_bytes(FALLBACK_PNG).expect("fallback PNG is always valid")
}

// ---------------------------------------------------------------------------
// Tray event helpers
// ---------------------------------------------------------------------------

/// Positions the popover directly below the tray icon click point and shows it.
/// Finds the monitor that contains the click so positioning is correct on any
/// display in a multi-monitor setup.
fn show_at_tray(app: &AppHandle, click_pos: tauri::PhysicalPosition<f64>) {
    let Some(window) = app.get_webview_window("main") else { return };

    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }

    // Find the monitor that contains the click point so we use the right
    // scale factor and can clamp to its bounds rather than monitor 0.
    let monitors = app.available_monitors().unwrap_or_default();
    let monitor = monitors.iter().find(|m| {
        let pos  = m.position();
        let size = m.size();
        click_pos.x >= pos.x as f64
            && click_pos.x < (pos.x + size.width as i32) as f64
            && click_pos.y >= pos.y as f64
            && click_pos.y < (pos.y + size.height as i32) as f64
    });

    // Scale factor and monitor left edge come from the clicked monitor.
    let scale    = monitor.map(|m| m.scale_factor()).unwrap_or(1.0);
    let mon_left = monitor.map(|m| m.position().x as f64).unwrap_or(0.0);
    let mon_top  = monitor.map(|m| m.position().y as f64).unwrap_or(0.0);
    let mon_right = monitor
        .map(|m| m.position().x as f64 + m.size().width as f64)
        .unwrap_or(f64::MAX);

    let pop_w = 300.0 * scale;

    // Centre on click, clamp so the window stays within the clicked monitor.
    let x = (click_pos.x - pop_w / 2.0)
        .max(mon_left)
        .min(mon_right - pop_w) as i32;

    // macOS menu bar is 24pt. Place the popup at the monitor's own top edge
    // plus the menu bar height — correct on every display in any arrangement.
    let y = (mon_top + 24.0 * scale) as i32;

    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    let _ = window.show();
    let _ = window.set_focus();
}
