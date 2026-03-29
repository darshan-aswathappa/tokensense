import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LoginPrompt } from "./components/LoginPrompt";
import { UsagePanel } from "./components/UsagePanel";
import type { OrgUsage } from "./types";
import "./App.css";

type Provider = "claude" | "codex";

function App() {
  const [activeTab, setActiveTab] = useState<Provider>("claude");

  // Claude state
  const [claudeConnected, setClaudeConnected] = useState(false);
  const [claudeOrgs, setClaudeOrgs] = useState<OrgUsage[]>([]);
  const [claudeLastUpdated, setClaudeLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    invoke<boolean>("is_connected")
      .then(setClaudeConnected)
      .catch(() => setClaudeConnected(false));

    const unlistenConn = listen<boolean>("connection-changed", (e) => {
      setClaudeConnected(e.payload);
    });

    const unlistenUsage = listen<OrgUsage[]>("usage-updated", (e) => {
      const now = new Date();
      if (Array.isArray(e.payload)) {
        console.log(`[poll] ${now.toISOString()} — received ${e.payload.length} org(s)`);
        e.payload.forEach((org) => {
          const u = org.usage;
          if (u) {
            console.log(
              `[poll]   ${org.org_name} | 5h: ${u.session_tokens_used}/${u.session_tokens_limit}` +
              (u.session_reset_at ? ` (resets ${u.session_reset_at})` : "") +
              ` | 7d: ${u.weekly_tokens_used}/${u.weekly_tokens_limit}` +
              (u.weekly_reset_at ? ` (resets ${u.weekly_reset_at})` : "")
            );
          } else if (org.error) {
            console.warn(`[poll]   ${org.org_name} — error: ${org.error}`);
          }
        });
        setClaudeOrgs(e.payload);
        setClaudeLastUpdated(now);
        setClaudeConnected(true);
      } else {
        console.warn(`[poll] ${now.toISOString()} — unexpected payload:`, e.payload);
      }
    });

    return () => {
      unlistenConn.then((fn) => fn());
      unlistenUsage.then((fn) => fn());
    };
  }, []);

  return (
    <div className="app">
      <header className="tabs">
        <button
          className={`tabs__btn ${activeTab === "claude" ? "tabs__btn--active" : ""}`}
          onClick={() => setActiveTab("claude")}
          type="button"
        >
          Claude
        </button>
        <button
          className={`tabs__btn ${activeTab === "codex" ? "tabs__btn--active" : ""}`}
          onClick={() => setActiveTab("codex")}
          type="button"
        >
          Codex
        </button>
      </header>

      <div className="tabs__content">
        {activeTab === "claude" && (
          <>
            {!claudeConnected ? (
              <LoginPrompt provider="claude" />
            ) : claudeOrgs.length > 0 ? (
              <UsagePanel orgs={claudeOrgs} lastUpdated={claudeLastUpdated} />
            ) : (
              <div className="empty">
                <span className="empty__text">Waiting for data</span>
                <button
                  className="empty__retry"
                  onClick={() => invoke("retry_connect")}
                  type="button"
                >
                  Retry
                </button>
              </div>
            )}
          </>
        )}

        {activeTab === "codex" && (
          <LoginPrompt provider="codex" />
        )}
      </div>
    </div>
  );
}

export default App;
