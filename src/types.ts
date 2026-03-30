export interface UsageData {
  session_tokens_used: number;
  session_tokens_limit: number;
  weekly_tokens_used: number;
  weekly_tokens_limit: number;
  session_reset_at: string | null;
  weekly_reset_at: string | null;
  extra_usage_active: boolean;
}

export interface OrgUsage {
  org_id: string;
  org_name: string;
  usage: UsageData | null;
  error: string | null;
}

export interface CodexSession {
  session_id: string;
  timestamp: string;
  model: string | null;
  plan_type: string | null;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  reasoning_output_tokens: number;
  context_window: number;
  rate_limit_used_percent: number | null;
  rate_limit_window_minutes: number | null;
}

export interface CodexReadResult {
  session: CodexSession | null;
  error: string | null;
}
