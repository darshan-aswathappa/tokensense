import type React from "react";
import { memo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { UsageBar } from "./UsageBar";
import type { OrgUsage } from "../types";

interface Props {
  orgs: OrgUsage[];
}

function pct(used: number, limit: number): number {
  return limit === 0 ? 0 : Math.round((used / limit) * 100);
}

function orgLabel(name: string): string {
  const m = name.match(/^([^\s@]+@[^'\s]+)/);
  return m ? "Personal" : name;
}

function relativeReset(iso: string): string | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const ms = t - Date.now();
  if (ms <= 0) return "now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

export const UsagePanel = memo(function UsagePanel({ orgs }: Props) {
  const disconnect = useCallback(() => invoke("disconnect"), []);

  return (
    <div className="panel">
      {orgs.map((org, orgIdx) => (
        <section
          key={org.org_id}
          className="org"
          style={{ '--i': orgIdx } as React.CSSProperties}
        >
          <span className="org__name">{orgLabel(org.org_name)}</span>

          {org.error ? (
            <span className="org__err">{org.error}</span>
          ) : org.usage ? (
            <>
              {org.usage.extra_usage_active && (
                <span className="org__extra">Extra usage</span>
              )}
              {org.usage.session_tokens_limit > 0 && (
                <UsageBar
                  label="5-hour"
                  percent={pct(org.usage.session_tokens_used, org.usage.session_tokens_limit)}
                  resetAt={org.usage.session_reset_at ? relativeReset(org.usage.session_reset_at) : null}
                  index={0}
                />
              )}
              {org.usage.weekly_tokens_limit > 0 && (
                <UsageBar
                  label="7-day"
                  percent={pct(org.usage.weekly_tokens_used, org.usage.weekly_tokens_limit)}
                  resetAt={org.usage.weekly_reset_at ? relativeReset(org.usage.weekly_reset_at) : null}
                  index={1}
                />
              )}
            </>
          ) : null}
        </section>
      ))}

      <footer className="panel__foot">
        <button className="panel__disconnect" onClick={disconnect} type="button">
          Disconnect
        </button>
      </footer>
    </div>
  );
});
