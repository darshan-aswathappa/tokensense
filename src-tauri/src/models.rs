/// Core data types for TokenSense usage tracking.

/// One organisation's usage, as returned to the frontend.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OrgUsage {
    pub org_id: String,
    pub org_name: String,
    pub usage: Option<UsageData>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UsageData {
    pub session_tokens_used: u64,
    pub session_tokens_limit: u64,
    pub weekly_tokens_used: u64,
    pub weekly_tokens_limit: u64,
    pub session_reset_at: Option<String>,
    pub weekly_reset_at: Option<String>,
}

impl UsageData {
    /// Returns the session token usage as a percentage (0.0–100.0).
    /// Returns 0.0 if the limit is zero to avoid division by zero.
    pub fn session_percent(&self) -> f64 {
        if self.session_tokens_limit == 0 {
            return 0.0;
        }
        (self.session_tokens_used as f64 / self.session_tokens_limit as f64) * 100.0
    }

    /// Returns the weekly token usage as a percentage (0.0–100.0).
    /// Returns 0.0 if the limit is zero to avoid division by zero.
    pub fn weekly_percent(&self) -> f64 {
        if self.weekly_tokens_limit == 0 {
            return 0.0;
        }
        (self.weekly_tokens_used as f64 / self.weekly_tokens_limit as f64) * 100.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_usage(
        session_used: u64,
        session_limit: u64,
        weekly_used: u64,
        weekly_limit: u64,
    ) -> UsageData {
        UsageData {
            session_tokens_used: session_used,
            session_tokens_limit: session_limit,
            weekly_tokens_used: weekly_used,
            weekly_tokens_limit: weekly_limit,
            session_reset_at: None,
            weekly_reset_at: None,
        }
    }

    #[test]
    fn session_percent_normal() {
        let usage = make_usage(50_000, 100_000, 0, 1_000_000);
        assert!((usage.session_percent() - 50.0).abs() < f64::EPSILON);
    }

    #[test]
    fn session_percent_full() {
        let usage = make_usage(100_000, 100_000, 0, 1_000_000);
        assert!((usage.session_percent() - 100.0).abs() < f64::EPSILON);
    }

    #[test]
    fn session_percent_zero_used() {
        let usage = make_usage(0, 100_000, 0, 1_000_000);
        assert!((usage.session_percent() - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn session_percent_zero_limit() {
        let usage = make_usage(50_000, 0, 0, 1_000_000);
        assert!((usage.session_percent() - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn weekly_percent_normal() {
        let usage = make_usage(0, 100_000, 250_000, 1_000_000);
        assert!((usage.weekly_percent() - 25.0).abs() < f64::EPSILON);
    }

    #[test]
    fn weekly_percent_full() {
        let usage = make_usage(0, 100_000, 1_000_000, 1_000_000);
        assert!((usage.weekly_percent() - 100.0).abs() < f64::EPSILON);
    }

    #[test]
    fn weekly_percent_zero_limit() {
        let usage = make_usage(0, 100_000, 500_000, 0);
        assert!((usage.weekly_percent() - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn serializes_to_json() {
        let usage = make_usage(10, 100, 20, 200);
        let json = serde_json::to_string(&usage).expect("serialize");
        assert!(json.contains("session_tokens_used"));
        assert!(json.contains("weekly_tokens_limit"));
    }

    #[test]
    fn round_trips_json() {
        let original = make_usage(12345, 200000, 98765, 1000000);
        let json = serde_json::to_string(&original).expect("serialize");
        let restored: UsageData = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(original.session_tokens_used, restored.session_tokens_used);
        assert_eq!(original.weekly_tokens_limit, restored.weekly_tokens_limit);
    }
}
