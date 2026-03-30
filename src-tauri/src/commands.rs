/// Tauri commands exposed to the frontend via `invoke()`.

use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::auth;
use crate::models::OrgUsage;
use crate::poller;
use crate::AppState;

// ---------------------------------------------------------------------------
// Public commands
// ---------------------------------------------------------------------------

/// Returns the most-recently-cached usage data for all organisations.
#[tauri::command]
pub async fn get_usage(state: State<'_, Arc<AppState>>) -> Result<Vec<OrgUsage>, String> {
    let lock = state.orgs.lock().map_err(|e| format!("lock poisoned: {e}"))?;
    Ok(lock.clone())
}

/// Opens a new Tauri window pointing to https://claude.ai so the user can log in.
#[tauri::command]
pub async fn open_login_window(app: AppHandle) -> Result<(), String> {
    auth::open_login_window(&app)
}

/// Returns whether the app is currently connected (has received valid usage data).
#[tauri::command]
pub async fn is_connected(state: State<'_, Arc<AppState>>) -> Result<bool, String> {
    let lock = state
        .connected
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;
    Ok(*lock)
}

/// Clears stored credentials from the keychain and resets connection state.
/// Emits `connection-changed: false` so the frontend switches back to LoginPrompt.
#[tauri::command]
pub async fn disconnect(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    auth::clear_credentials()?;

    {
        let mut lock = state.connected.lock().map_err(|e| format!("lock poisoned: {e}"))?;
        *lock = false;
    }
    {
        let mut lock = state.orgs.lock().map_err(|e| format!("lock poisoned: {e}"))?;
        lock.clear();
    }

    let _ = app.emit("connection-changed", false);
    Ok(())
}

/// Called by the login window's initialization script with the JSON payload
/// produced by fetching all org usage.  Parses the payload, updates state,
/// and emits `usage-updated`.
///
/// On the *first* successful call (connected was `false`), also hides the
/// login window and shows the main popover so the UI transitions automatically.
#[tauri::command]
pub async fn update_usage_from_js(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    raw_json: String,
) -> Result<(), String> {
    // Snapshot connected before processing so we can detect first connection.
    let was_connected = *state
        .connected
        .lock()
        .map_err(|e| format!("lock poisoned: {e}"))?;

    poller::handle_js_result(&app, &raw_json);

    // If this is the first time we received valid data, handle the UI transition.
    if !was_connected {
        let now_connected = *state
            .connected
            .lock()
            .map_err(|e| format!("lock poisoned: {e}"))?;

        if now_connected {
            // Hide the login window (its setInterval keeps running for future polls).
            if let Some(login_win) = app.get_webview_window("login") {
                let _ = login_win.hide();
            }
            // Show and focus the main popover.
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = main_win.show();
                let _ = main_win.set_focus();
            }
            let _ = app.emit("connection-changed", true);
        }
    }

    Ok(())
}

/// Reads the most recent Codex session for today from local files.
#[tauri::command]
pub async fn read_codex_session() -> Result<crate::codex::CodexReadResult, String> {
    Ok(crate::codex::read_today_session())
}

/// Shows the login window (or opens a fresh one) so the user can retry.
/// The login window's initialization script will restart its detection loop
/// on the next page load, or the existing setInterval will fire within 5 min.
#[tauri::command]
pub async fn retry_connect(app: AppHandle) -> Result<(), String> {
    auth::open_login_window(&app)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use crate::AppState;

    fn make_state() -> std::sync::Arc<AppState> {
        std::sync::Arc::new(AppState {
            orgs: Mutex::new(Vec::new()),
            connected: Mutex::new(false),
        })
    }

    fn make_org(id: &str, name: &str, session_used: u64, session_limit: u64) -> crate::models::OrgUsage {
        crate::models::OrgUsage {
            org_id: id.to_string(),
            org_name: name.to_string(),
            usage: Some(crate::models::UsageData {
                session_tokens_used: session_used,
                session_tokens_limit: session_limit,
                weekly_tokens_used: 0,
                weekly_tokens_limit: 1_000_000,
                session_reset_at: None,
                weekly_reset_at: None,
                extra_usage_active: false,
            }),
            error: None,
        }
    }

    #[test]
    fn initial_state_is_disconnected() {
        let state = make_state();
        assert!(!*state.connected.lock().unwrap());
        assert!(state.orgs.lock().unwrap().is_empty());
    }

    #[test]
    fn state_usage_round_trip() {
        let state = make_state();

        let org1 = make_org("org-abc", "Northeastern University", 10_000, 50_000);
        let org2 = make_org("org-xyz", "Personal", 200_000, 1_000_000);

        *state.orgs.lock().unwrap() = vec![org1, org2];
        *state.connected.lock().unwrap() = true;

        assert!(*state.connected.lock().unwrap());
        let orgs = state.orgs.lock().unwrap().clone();
        assert_eq!(orgs.len(), 2);
        assert_eq!(orgs[0].org_name, "Northeastern University");
        assert_eq!(orgs[0].usage.as_ref().unwrap().session_tokens_used, 10_000);
        assert_eq!(orgs[1].org_name, "Personal");
    }

    #[test]
    fn disconnect_clears_state() {
        let state = make_state();

        *state.connected.lock().unwrap() = true;
        *state.orgs.lock().unwrap() = vec![make_org("org-abc", "Test", 1, 100)];

        // Simulate disconnect (without Tauri runtime).
        *state.connected.lock().unwrap() = false;
        state.orgs.lock().unwrap().clear();

        assert!(!*state.connected.lock().unwrap());
        assert!(state.orgs.lock().unwrap().is_empty());
    }
}
