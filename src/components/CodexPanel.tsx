import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { UsageBar } from "./UsageBar";
import type { CodexReadResult } from "../types";

type State = "loading" | "loaded" | "no-session" | "error";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function CodexPanel() {
  const [state, setState] = useState<State>("loading");
  const [session, setSession] = useState<CodexReadResult["session"]>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSession = async () => {
    setState("loading");
    setError(null);

    try {
      const result = await invoke<CodexReadResult>("read_codex_session");

      if (result.error) {
        setState("error");
        setError(result.error);
      } else if (result.session) {
        setState("loaded");
        setSession(result.session);
      } else {
        setState("no-session");
      }
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  if (state === "loading") {
    return (
      <div className="empty">
        <span className="empty__text">Reading sessions...</span>
      </div>
    );
  }

  if (state === "no-session") {
    return (
      <div className="empty">
        <span className="empty__text">No recent sessions found for today.</span>
        <button className="empty__retry" onClick={loadSession} type="button" aria-label="Refresh">
          Refresh
        </button>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="empty">
        <span className="codex__err">{error}</span>
        <button className="empty__retry" onClick={loadSession} type="button" aria-label="Refresh">
          Retry
        </button>
      </div>
    );
  }

  // state === "loaded"
  return (
    <div className="panel">
      <section className="org">
        <span className="org__name">
          Latest Session{session?.plan_type ? ` \u00b7 ${session.plan_type}` : ""}
        </span>

        {session!.rate_limit_used_percent !== null && (
          <UsageBar
            label="7-day"
            percent={session!.rate_limit_used_percent}
            resetAt={null}
          />
        )}

        <div className="codex__grid">
          <div className="codex__stat">
            <span className="codex__stat-label">Total</span>
            <span className="codex__stat-value">{fmt(session!.total_tokens)}</span>
          </div>
          <div className="codex__stat">
            <span className="codex__stat-label">Input</span>
            <span className="codex__stat-value">{fmt(session!.input_tokens)}</span>
          </div>
          <div className="codex__stat">
            <span className="codex__stat-label">Output</span>
            <span className="codex__stat-value">{fmt(session!.output_tokens)}</span>
          </div>
          <div className="codex__stat">
            <span className="codex__stat-label">Cached</span>
            <span className="codex__stat-value">{fmt(session!.cached_input_tokens)}</span>
          </div>
          {session!.reasoning_output_tokens > 0 && (
            <div className="codex__stat">
              <span className="codex__stat-label">Reasoning</span>
              <span className="codex__stat-value">{fmt(session!.reasoning_output_tokens)}</span>
            </div>
          )}
        </div>

      </section>

      <footer className="panel__foot">
        <button className="panel__disconnect" onClick={loadSession} type="button" aria-label="Refresh">
          Refresh
        </button>
      </footer>
    </div>
  );
}
