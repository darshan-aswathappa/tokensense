import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { UsageBar } from "./UsageBar";
import type { CodexReadResult } from "../types";

function useCountUp(target: number, duration = 550): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }

    setValue(0);
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(Math.round(target * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

function StatValue({ n, index }: { n: number; index: number }) {
  const value = useCountUp(n);
  return (
    <span
      className="codex__stat-value"
      style={{ '--i': index } as React.CSSProperties}
    >
      {value.toLocaleString("en-US")}
    </span>
  );
}

type State = "loading" | "loaded" | "no-session" | "error";

export function CodexPanel() {
  const [state, setState] = useState<State>("loading");
  const [session, setSession] = useState<CodexReadResult["session"]>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  if (state === "loading") {
    return (
      <div className="empty empty--loading">
        <span className="empty__text">Reading sessions</span>
      </div>
    );
  }

  if (state === "no-session") {
    return (
      <div className="empty">
        <span className="empty__text">No Codex sessions found today.</span>
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
  if (!session) return null;

  return (
    <div className="panel">
      <section className="org">
        <span className="org__name">
          Latest Session{session.plan_type ? ` \u00b7 ${session.plan_type}` : ""}
        </span>

        {session.rate_limit_used_percent !== null && (
          <UsageBar
            label="7-day"
            percent={session.rate_limit_used_percent}
            resetAt={null}
          />
        )}

        <div className="codex__grid">
          <div className="codex__stat" style={{ '--i': 0 } as React.CSSProperties}>
            <span className="codex__stat-label">Total</span>
            <StatValue n={session.total_tokens} index={0} />
          </div>
          <div className="codex__stat" style={{ '--i': 1 } as React.CSSProperties}>
            <span className="codex__stat-label">Input</span>
            <StatValue n={session.input_tokens} index={1} />
          </div>
          <div className="codex__stat" style={{ '--i': 2 } as React.CSSProperties}>
            <span className="codex__stat-label">Output</span>
            <StatValue n={session.output_tokens} index={2} />
          </div>
          <div className="codex__stat" style={{ '--i': 3 } as React.CSSProperties}>
            <span className="codex__stat-label">Cached</span>
            <StatValue n={session.cached_input_tokens} index={3} />
          </div>
          {session.reasoning_output_tokens > 0 && (
            <div className="codex__stat" style={{ '--i': 4 } as React.CSSProperties}>
              <span className="codex__stat-label">Reasoning</span>
              <StatValue n={session.reasoning_output_tokens} index={4} />
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
