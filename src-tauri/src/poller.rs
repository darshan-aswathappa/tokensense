/// Background polling loop that injects JavaScript into the main WebView
/// to fetch Claude usage data from the browser context (bypassing Cloudflare).
///
/// Security note: `window.eval` / Tauri `WebviewWindow::eval` is used here to
/// run a STATIC, compile-time-defined script inside the WKWebView.  No
/// user-provided input is ever interpolated into this string.  This is the
/// only way to make authenticated fetch() calls that share the WebView cookie
/// jar with the logged-in Claude.ai session.

use std::time::Duration;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager};

use crate::AppState;

/// Event name emitted to the frontend when fresh usage data arrives.
pub const EVENT_USAGE_UPDATED: &str = "usage-updated";

/// Polling interval (2 minutes).
const POLL_INTERVAL: Duration = Duration::from_secs(2 * 60);

/// Static JS executed inside the main WebView.
/// Calls the Claude API using the browser session cookies already present in
/// WKWebView's cookie jar, then calls back into Rust via `window.__TAURI__`
/// to deliver the result to `update_usage_from_js`.
///
/// Using a compile-time string literal (no runtime interpolation) keeps this
/// safe — no user input is ever evaluated.
/// Fetches usage for ALL organisations in parallel and reports them back.
/// Uses `window.__TAURI_INTERNALS__` (always present in Tauri WebViews, even
/// for external URLs) to call back into Rust.
const FETCH_AND_REPORT_SCRIPT: &str = r#"(async () => {
  function inv(cmd, args) {
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)
      return window.__TAURI_INTERNALS__.invoke(cmd, args);
    if (window.__TAURI__ && window.__TAURI__.core)
      return window.__TAURI__.core.invoke(cmd, args);
    return Promise.reject('no tauri ipc');
  }
  try {
    const orgsResp = await fetch('https://claude.ai/api/organizations', {
      credentials: 'include',
      headers: { 'anthropic-client-platform': 'web_claude_ai' }
    });
    if (!orgsResp.ok) {
      await inv('update_usage_from_js', { rawJson: JSON.stringify({ error: 'orgs fetch ' + orgsResp.status }) });
      return;
    }
    const orgs = await orgsResp.json();
    if (!Array.isArray(orgs) || orgs.length === 0) {
      await inv('update_usage_from_js', { rawJson: JSON.stringify({ error: 'no orgs found' }) });
      return;
    }
    const results = await Promise.all(orgs.map(async (org) => {
      const orgId = org.uuid || org.id || '';
      const orgName = org.name || orgId;
      try {
        const r = await fetch('https://claude.ai/api/organizations/' + orgId + '/usage', {
          credentials: 'include',
          headers: { 'anthropic-client-platform': 'web_claude_ai' }
        });
        if (!r.ok) return { orgId, orgName, error: 'usage fetch ' + r.status };
        const usageJson = await r.json();
        return { orgId, orgName, usage: usageJson, rawUsage: JSON.stringify(usageJson) };
      } catch (e) {
        return { orgId, orgName, error: String(e) };
      }
    }));
    await inv('update_usage_from_js', { rawJson: JSON.stringify({ orgs: results }) });
  } catch (e) {
    try { await inv('update_usage_from_js', { rawJson: JSON.stringify({ error: String(e) }) }); } catch (_) {}
  }
})()"#;

/// Spawns a background Tokio task that polls Claude every `POLL_INTERVAL`.
/// Returns immediately; polling runs on the async runtime.
pub fn start_polling(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(POLL_INTERVAL).await;
            poll_once(&app_handle).await;
        }
    });
}

/// Performs a single poll immediately. Called on login and by the background loop.
pub async fn poll_now(app: &AppHandle) {
    poll_once(app).await;
}

/// Performs one poll: injects the static fetch script into the login WebView.
/// The login window runs on claude.ai and has the session cookies, so the
/// fetch() calls inside the script are authenticated automatically.
async fn poll_once(app: &AppHandle) {
    let window = match app.get_webview_window("login") {
        Some(w) => w,
        None => {
            eprintln!("[poller] login window not found, skipping poll");
            return;
        }
    };

    // `eval` runs the static script in the WebView context.
    // The script itself calls back into Rust via `invoke('update_usage_from_js')`.
    if let Err(e) = window.eval(FETCH_AND_REPORT_SCRIPT) {
        eprintln!("[poller] eval error: {e}");
    }
}

/// Called by the `update_usage_from_js` Tauri command with the raw JSON string
/// produced by `FETCH_AND_REPORT_SCRIPT`.  Parses the `{ orgs: [...] }` payload,
/// updates `AppState`, and emits `usage-updated` to the frontend.
pub fn handle_js_result(app: &AppHandle, raw_json: &str) {
    use crate::models::OrgUsage;

    let state = app.state::<Arc<AppState>>();

    let v: serde_json::Value = match serde_json::from_str(raw_json) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[poller] JSON parse error: {e}  raw={raw_json}");
            return;
        }
    };

    if let Some(error_msg) = v.get("error").and_then(|e| e.as_str()) {
        eprintln!("[poller] JS returned error: {error_msg}");
        let _ = app.emit(EVENT_USAGE_UPDATED, serde_json::json!({ "error": error_msg }));
        return;
    }

    if let Some(orgs_arr) = v.get("orgs").and_then(|o| o.as_array()) {
        let raw_org_usages: Vec<OrgUsage> = orgs_arr
            .iter()
            .map(|item| {
                let org_id = item
                    .get("orgId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let org_name = item
                    .get("orgName")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&org_id)
                    .to_string();

                if let Some(err) = item.get("error").and_then(|e| e.as_str()) {
                    return OrgUsage {
                        org_id,
                        org_name,
                        usage: None,
                        error: Some(err.to_string()),
                    };
                }

                // Log raw usage JSON to stderr for field-name debugging.
                if let Some(raw) = item.get("rawUsage").and_then(|r| r.as_str()) {
                    eprintln!("[poller] raw usage for org={org_name}: {raw}");
                }

                let usage = item
                    .get("usage")
                    .and_then(|u| parse_usage_data(u).ok());

                OrgUsage { org_id, org_name, usage, error: None }
            })
            .collect();

        // Deduplicate by org_name: prefer entries with usage data over error-only entries.
        // When both have usage (or both have errors), keep the first occurrence.
        let mut seen: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        let mut deduped: Vec<OrgUsage> = Vec::new();
        for org in raw_org_usages {
            if let Some(&existing_idx) = seen.get(&org.org_name) {
                // A duplicate name — replace the existing slot only if the current entry
                // has usage data and the existing one does not.
                if org.usage.is_some() && deduped[existing_idx].usage.is_none() {
                    deduped[existing_idx] = org;
                }
                // Otherwise discard the duplicate.
            } else {
                seen.insert(org.org_name.clone(), deduped.len());
                deduped.push(org);
            }
        }

        // Filter out orgs whose error contains "403" — access denied, nothing to show.
        let org_usages: Vec<OrgUsage> = deduped
            .into_iter()
            .filter(|org| {
                !org.error.as_deref().unwrap_or("").contains("403")
            })
            .collect();

        if let Ok(mut lock) = state.orgs.lock() {
            *lock = org_usages.clone();
        }
        if let Ok(mut lock) = state.connected.lock() {
            *lock = true;
        }
        let _ = app.emit(EVENT_USAGE_UPDATED, &org_usages);
        return;
    }

    eprintln!("[poller] unrecognised payload: {raw_json}");
}

/// Maps the Claude API usage response shape onto `UsageData`.
///
/// The Claude.ai usage endpoint returns utilization windows:
///   five_hour:  { utilization: 0-100, resets_at: ISO string } | null
///   seven_day:  { utilization: 0-100, resets_at: ISO string } | null
///   extra_usage: { used_credits, monthly_limit, utilization } — fallback when above are null
///
/// We store utilization as `used = percent, limit = 100` so the frontend's
/// calcPercent() produces the correct percentage directly.
fn parse_usage_data(v: &serde_json::Value) -> Result<crate::models::UsageData, String> {
    /// Extracts `(utilization_percent, resets_at)` from a nullable window object.
    /// Returns `None` if the window is absent or null.
    /// Uses `as_f64` to handle both integer and float utilization values from the API.
    fn window(v: &serde_json::Value, key: &str) -> Option<(u64, Option<String>)> {
        let w = v.get(key)?;
        if w.is_null() { return None; }
        let util = w.get("utilization")
            .and_then(|u| u.as_f64())
            .map(|f| f.round() as u64)?;
        let reset = w.get("resets_at").and_then(|r| r.as_str()).map(String::from);
        Some((util, reset))
    }

    // Detect extra_usage: present, non-null, AND is_enabled=true.
    let extra_usage_active = v.get("extra_usage")
        .filter(|e| !e.is_null())
        .and_then(|e| e.get("is_enabled"))
        .and_then(|b| b.as_bool())
        .unwrap_or(false);

    // Session → five_hour window; fallback to extra_usage monthly credits.
    let (sess_used, sess_limit, sess_reset) = match window(v, "five_hour") {
        Some((util, reset)) => (util, 100u64, reset),
        None => {
            if let Some(extra) = v.get("extra_usage").filter(|e| !e.is_null()) {
                let used  = extra.get("used_credits").and_then(|u| u.as_f64()).map(|f| f.round() as u64).unwrap_or(0);
                let limit = extra.get("monthly_limit").and_then(|l| l.as_f64()).map(|f| f.round() as u64).unwrap_or(0);
                (used, limit, None)
            } else {
                (0, 0, None)
            }
        }
    };

    // Weekly → seven_day window; 0/0 when absent.
    let (week_used, week_limit, week_reset) = match window(v, "seven_day") {
        Some((util, reset)) => (util, 100u64, reset),
        None => (0, 0, None),
    };

    Ok(crate::models::UsageData {
        session_tokens_used:  sess_used,
        session_tokens_limit: sess_limit,
        weekly_tokens_used:   week_used,
        weekly_tokens_limit:  week_limit,
        session_reset_at:     sess_reset,
        weekly_reset_at:      week_reset,
        extra_usage_active,
    })
}
