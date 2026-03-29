export interface UsageData {
  session_tokens_used: number;
  session_tokens_limit: number;
  weekly_tokens_used: number;
  weekly_tokens_limit: number;
  session_reset_at: string | null;
  weekly_reset_at: string | null;
}

export interface OrgUsage {
  org_id: string;
  org_name: string;
  usage: UsageData | null;
  error: string | null;
}
