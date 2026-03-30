/// Codex session reader — reads local `.codex/sessions/` directory to extract
/// token usage from the most recent session file for today.

use std::fs;
use std::path::PathBuf;

use chrono::Local;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CodexSession {
    pub session_id: String,
    pub timestamp: String,
    pub model: Option<String>,
    pub plan_type: Option<String>,
    pub total_tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_input_tokens: u64,
    pub reasoning_output_tokens: u64,
    pub context_window: u64,
    pub rate_limit_used_percent: Option<f64>,
    pub rate_limit_window_minutes: Option<u64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CodexReadResult {
    pub session: Option<CodexSession>,
    pub error: Option<String>,
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/// Returns the base sessions directory: `~/.codex/sessions`.
fn sessions_base_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".codex").join("sessions"))
}

/// Returns today's session directory: `~/.codex/sessions/YYYY/MM/DD`.
fn today_session_dir() -> Option<PathBuf> {
    let now = Local::now();
    sessions_base_dir().map(|base| {
        base.join(now.format("%Y").to_string())
            .join(now.format("%m").to_string())
            .join(now.format("%d").to_string())
    })
}

/// Finds the most recent `.jsonl` session file in a directory by comparing
/// the timestamp embedded in the filename (e.g. `rollout-2026-03-29T19-08-07-<id>.jsonl`).
pub fn find_latest_session_file(dir: &PathBuf) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;

    let mut jsonl_files: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .map(|ext| ext == "jsonl")
                .unwrap_or(false)
        })
        .collect();

    // Sort by filename descending — the embedded timestamp means lexicographic
    // order matches chronological order.
    jsonl_files.sort_by(|a, b| {
        let a_name = a.file_name().unwrap_or_default().to_string_lossy();
        let b_name = b.file_name().unwrap_or_default().to_string_lossy();
        b_name.cmp(&a_name)
    });

    jsonl_files.into_iter().next()
}

/// Parses a `.jsonl` session file and extracts the last `token_count` event.
pub fn parse_session_file(path: &PathBuf) -> Result<CodexSession, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read session file: {e}"))?;

    let mut last_token_event: Option<serde_json::Value> = None;
    let mut session_id = String::new();
    let mut model: Option<String> = None;

    for line in content.lines() {
        let parsed: serde_json::Value = serde_json::from_str(line)
            .map_err(|e| format!("Invalid JSON line: {e}"))?;

        match parsed.get("type").and_then(|t| t.as_str()) {
            Some("session_meta") => {
                if let Some(payload) = parsed.get("payload") {
                    if let Some(id) = payload.get("id").and_then(|v| v.as_str()) {
                        session_id = id.to_string();
                    }
                }
            }
            Some("event_msg") => {
                if let Some(payload) = parsed.get("payload") {
                    if payload.get("type").and_then(|t| t.as_str()) == Some("token_count") {
                        last_token_event = Some(payload.clone());
                    }
                }
            }
            Some("response_item") => {
                // Try to extract model from response items
                if model.is_none() {
                    if let Some(payload) = parsed.get("payload") {
                        if let Some(m) = payload.get("model").and_then(|v| v.as_str()) {
                            model = Some(m.to_string());
                        }
                    }
                }
            }
            _ => {}
        }
    }

    let token_event = last_token_event
        .ok_or_else(|| "No token usage data found in session".to_string())?;

    let timestamp = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let total_usage = token_event
        .get("info")
        .and_then(|i| i.get("total_token_usage"));

    let rate_limits = token_event.get("rate_limits");

    let context_window = token_event
        .get("info")
        .and_then(|i| i.get("model_context_window"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    Ok(CodexSession {
        session_id,
        timestamp,
        model,
        plan_type: rate_limits
            .and_then(|r| r.get("plan_type"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        total_tokens: total_usage
            .and_then(|u| u.get("total_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        input_tokens: total_usage
            .and_then(|u| u.get("input_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        output_tokens: total_usage
            .and_then(|u| u.get("output_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        cached_input_tokens: total_usage
            .and_then(|u| u.get("cached_input_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        reasoning_output_tokens: total_usage
            .and_then(|u| u.get("reasoning_output_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        context_window,
        rate_limit_used_percent: rate_limits
            .and_then(|r| r.get("primary"))
            .and_then(|p| p.get("used_percent"))
            .and_then(|v| v.as_f64()),
        rate_limit_window_minutes: rate_limits
            .and_then(|r| r.get("primary"))
            .and_then(|p| p.get("window_minutes"))
            .and_then(|v| v.as_u64()),
    })
}

/// Main entry point: reads today's most recent Codex session.
pub fn read_today_session() -> CodexReadResult {
    let dir = match today_session_dir() {
        Some(d) => d,
        None => {
            return CodexReadResult {
                session: None,
                error: Some("Could not determine home directory".to_string()),
            }
        }
    };

    if !dir.exists() {
        return CodexReadResult {
            session: None,
            error: None, // No sessions today — not an error
        };
    }

    let file = match find_latest_session_file(&dir) {
        Some(f) => f,
        None => {
            return CodexReadResult {
                session: None,
                error: None,
            }
        }
    };

    match parse_session_file(&file) {
        Ok(session) => CodexReadResult {
            session: Some(session),
            error: None,
        },
        Err(e) => CodexReadResult {
            session: None,
            error: Some(e),
        },
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn make_session_dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    fn write_session_file(dir: &std::path::Path, name: &str, content: &str) {
        let path = dir.join(name);
        let mut f = fs::File::create(&path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
    }

    const SAMPLE_SESSION: &str = r#"{"timestamp":"2026-03-29T23:08:44.162Z","type":"session_meta","payload":{"id":"019d3bda-ca31-7fc0-bb9d-93645758c171","timestamp":"2026-03-29T23:08:07.606Z","cwd":"/Users/test","originator":"codex_cli_rs","cli_version":"0.113.0","source":"cli","model_provider":"openai"}}
{"timestamp":"2026-03-29T23:08:46.636Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":8878,"cached_input_tokens":7808,"output_tokens":6,"reasoning_output_tokens":0,"total_tokens":8884},"last_token_usage":{"input_tokens":8878,"cached_input_tokens":7808,"output_tokens":6,"reasoning_output_tokens":0,"total_tokens":8884},"model_context_window":258400},"rate_limits":{"limit_id":"codex","limit_name":null,"primary":{"used_percent":0.0,"window_minutes":10080,"resets_at":1775430524},"secondary":null,"credits":null,"plan_type":"go"}}}"#;

    #[test]
    fn find_latest_picks_newest_file() {
        let dir = make_session_dir();
        write_session_file(
            dir.path(),
            "rollout-2026-03-29T19-08-07-aaa.jsonl",
            SAMPLE_SESSION,
        );
        write_session_file(
            dir.path(),
            "rollout-2026-03-29T23-46-18-bbb.jsonl",
            SAMPLE_SESSION,
        );
        write_session_file(
            dir.path(),
            "rollout-2026-03-29T23-28-26-ccc.jsonl",
            SAMPLE_SESSION,
        );

        let latest = find_latest_session_file(&dir.path().to_path_buf()).unwrap();
        let name = latest.file_name().unwrap().to_string_lossy();
        assert!(
            name.contains("23-46-18"),
            "Expected 23-46-18 file, got: {name}"
        );
    }

    #[test]
    fn find_latest_returns_none_for_empty_dir() {
        let dir = make_session_dir();
        let result = find_latest_session_file(&dir.path().to_path_buf());
        assert!(result.is_none());
    }

    #[test]
    fn find_latest_ignores_non_jsonl() {
        let dir = make_session_dir();
        write_session_file(dir.path(), "notes.txt", "hello");
        write_session_file(dir.path(), "data.json", "{}");

        let result = find_latest_session_file(&dir.path().to_path_buf());
        assert!(result.is_none());
    }

    #[test]
    fn parse_session_extracts_token_data() {
        let dir = make_session_dir();
        let file_name = "rollout-2026-03-29T23-08-07-test.jsonl";
        write_session_file(dir.path(), file_name, SAMPLE_SESSION);

        let path = dir.path().join(file_name);
        let session = parse_session_file(&path).unwrap();

        assert_eq!(session.session_id, "019d3bda-ca31-7fc0-bb9d-93645758c171");
        assert_eq!(session.total_tokens, 8884);
        assert_eq!(session.input_tokens, 8878);
        assert_eq!(session.output_tokens, 6);
        assert_eq!(session.cached_input_tokens, 7808);
        assert_eq!(session.reasoning_output_tokens, 0);
        assert_eq!(session.context_window, 258400);
        assert_eq!(session.plan_type.as_deref(), Some("go"));
        assert!((session.rate_limit_used_percent.unwrap() - 0.0).abs() < f64::EPSILON);
        assert_eq!(session.rate_limit_window_minutes, Some(10080));
    }

    #[test]
    fn parse_session_fails_on_no_token_events() {
        let dir = make_session_dir();
        let content = r#"{"timestamp":"2026-03-29T23:08:44.162Z","type":"session_meta","payload":{"id":"test-id"}}"#;
        let file_name = "rollout-2026-03-29T23-08-07-test.jsonl";
        write_session_file(dir.path(), file_name, content);

        let path = dir.path().join(file_name);
        let result = parse_session_file(&path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No token usage data"));
    }

    #[test]
    fn parse_session_uses_last_token_event() {
        let dir = make_session_dir();
        let content = r#"{"timestamp":"2026-03-29T23:08:44.162Z","type":"session_meta","payload":{"id":"test-id"}}
{"timestamp":"2026-03-29T23:08:44.379Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":100,"cached_input_tokens":0,"output_tokens":10,"reasoning_output_tokens":0,"total_tokens":110},"model_context_window":258400},"rate_limits":{"limit_id":"codex","primary":{"used_percent":1.0,"window_minutes":10080},"plan_type":"go"}}}
{"timestamp":"2026-03-29T23:08:46.636Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":5000,"cached_input_tokens":4000,"output_tokens":500,"reasoning_output_tokens":100,"total_tokens":5500},"model_context_window":258400},"rate_limits":{"limit_id":"codex","primary":{"used_percent":5.0,"window_minutes":10080},"plan_type":"go"}}}"#;
        let file_name = "rollout-2026-03-29T23-08-07-test.jsonl";
        write_session_file(dir.path(), file_name, content);

        let path = dir.path().join(file_name);
        let session = parse_session_file(&path).unwrap();

        // Should use the LAST token_count event (5500, not 110)
        assert_eq!(session.total_tokens, 5500);
        assert_eq!(session.input_tokens, 5000);
        assert_eq!(session.output_tokens, 500);
    }

    #[test]
    fn read_today_no_dir_returns_none() {
        // This test validates the logic flow — today's dir may or may not exist,
        // but the function should never panic.
        let result = read_today_session();
        // Either a session or None, but no panic
        assert!(result.error.is_none() || result.session.is_none());
    }
}
