/// Authentication helpers: open login window, store/load/clear credentials.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Initialization script injected into every page the login window loads.
///
/// All data-fetching happens here — no eval from Rust needed.
/// 1. Polls `/api/organizations` every 2 s until the user is logged in.
/// 2. On login: fetches usage for every org in parallel.
/// 3. Calls `update_usage_from_js` with the full payload.
/// 4. Starts a 2-minute setInterval for subsequent polls.
///
/// `update_usage_from_js` (Rust side) handles the first-connection UI
/// transition (hide this window, show the main popover).
const LOGIN_DETECT_SCRIPT: &str = r#"(function(){
  'use strict';
  var pollingStarted = false;

  function inv(cmd, args) {
    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function')
      return window.__TAURI_INTERNALS__.invoke(cmd, args || {});
    if (window.__TAURI__ && window.__TAURI__.core)
      return window.__TAURI__.core.invoke(cmd, args || {});
    return Promise.reject('tauri ipc not ready');
  }

  async function fetchAndReport() {
    var r = await fetch('/api/organizations', {
      credentials: 'include',
      headers: { 'anthropic-client-platform': 'web_claude_ai' }
    });
    if (!r.ok) throw new Error('orgs ' + r.status);
    var orgs = await r.json();
    if (!Array.isArray(orgs) || orgs.length === 0) throw new Error('no orgs');

    var results = await Promise.all(orgs.map(async function(org) {
      var orgId = org.uuid || org.id || '';
      var orgName = org.name || orgId;
      try {
        var ur = await fetch('/api/organizations/' + orgId + '/usage', {
          credentials: 'include',
          headers: { 'anthropic-client-platform': 'web_claude_ai' }
        });
        if (!ur.ok) return { orgId: orgId, orgName: orgName, error: 'usage ' + ur.status };
        return { orgId: orgId, orgName: orgName, usage: await ur.json() };
      } catch (e) {
        return { orgId: orgId, orgName: orgName, error: String(e) };
      }
    }));

    await inv('update_usage_from_js', { rawJson: JSON.stringify({ orgs: results }) });
  }

  function tryDetect(attempt) {
    if (attempt > 150) return;
    fetchAndReport()
      .then(function() {
        if (!pollingStarted) {
          pollingStarted = true;
          setInterval(function() {
            fetchAndReport().catch(function() {});
          }, 2 * 60 * 1000);
        }
      })
      .catch(function() {
        setTimeout(function() { tryDetect(attempt + 1); }, 2000);
      });
  }

  setTimeout(function() { tryDetect(0); }, 1500);
})();"#;

use crate::keychain;

const KEY_ORG_ID: &str = "org_id";
const KEY_SESSION: &str = "session_key";
const LOGIN_WINDOW_LABEL: &str = "login";

/// Opens a new window pointing at https://claude.ai so the user can log in.
/// The WKWebView underneath shares the default cookie jar with the main window,
/// so cookies established during login are immediately available for JS
/// evaluation in the main window.
pub fn open_login_window(app: &AppHandle) -> Result<(), String> {
    // If the login window already exists just focus it rather than creating a
    // duplicate.
    if let Some(existing) = app.get_webview_window(LOGIN_WINDOW_LABEL) {
        existing
            .show()
            .map_err(|e: tauri::Error| format!("failed to show existing login window: {e}"))?;
        existing
            .set_focus()
            .map_err(|e: tauri::Error| format!("failed to focus existing login window: {e}"))?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        LOGIN_WINDOW_LABEL,
        WebviewUrl::External("https://claude.ai".parse().map_err(|e| {
            format!("failed to parse claude.ai URL: {e}")
        })?),
    )
    .title("Login to Claude")
    .inner_size(900.0, 700.0)
    .resizable(false)
    .initialization_script(LOGIN_DETECT_SCRIPT)
    .build()
    .map_err(|e| format!("failed to create login window: {e}"))?;

    Ok(())
}

/// Persists `org_id` and `session_key` in the system keychain.
pub fn save_credentials(org_id: &str, session_key: &str) -> Result<(), String> {
    keychain::save_value(KEY_ORG_ID, org_id)?;
    keychain::save_value(KEY_SESSION, session_key)?;
    Ok(())
}

/// Retrieves stored credentials. Returns `None` if either piece is missing.
pub fn load_credentials() -> Result<Option<(String, String)>, String> {
    let org_id = keychain::load_value(KEY_ORG_ID)?;
    let session_key = keychain::load_value(KEY_SESSION)?;
    match (org_id, session_key) {
        (Some(o), Some(s)) => Ok(Some((o, s))),
        _ => Ok(None),
    }
}

/// Removes both credentials from the keychain.
pub fn clear_credentials() -> Result<(), String> {
    keychain::delete_value(KEY_ORG_ID)?;
    keychain::delete_value(KEY_SESSION)?;
    Ok(())
}
