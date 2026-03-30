import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CodexPanel } from "./components/CodexPanel";
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
  // True while the silent startup auth check is in flight. Stays true for up
  // to 8 s — long enough for the WKWebView cookie check to resolve. Flips to
  // false on connect or timeout so the LoginPrompt is only shown when we're
  // sure the user isn't already authenticated.
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const authTimeout = setTimeout(() => setIsCheckingAuth(false), 8_000);

    const unlistenConn = listen<boolean>("connection-changed", (e) => {
      setClaudeConnected(e.payload);
      if (e.payload) setIsCheckingAuth(false);
    });

    const unlistenUsage = listen<OrgUsage[]>("usage-updated", (e) => {
      if (Array.isArray(e.payload)) {
        setClaudeOrgs(e.payload);
        setClaudeConnected(true);
        setIsCheckingAuth(false);
      }
    });

    return () => {
      clearTimeout(authTimeout);
      unlistenConn.then((fn) => fn());
      unlistenUsage.then((fn) => fn());
    };
  }, []);

  return (
    <div className="app">
      <header className="tabs" role="tablist">
        <button
          id="tab-claude"
          className={`tabs__btn ${activeTab === "claude" ? "tabs__btn--active" : ""}`}
          onClick={() => setActiveTab("claude")}
          type="button"
          role="tab"
          aria-selected={activeTab === "claude"}
          aria-controls="panel-claude"
        >
          Claude
        </button>
        <button
          id="tab-codex"
          className={`tabs__btn ${activeTab === "codex" ? "tabs__btn--active" : ""}`}
          onClick={() => setActiveTab("codex")}
          type="button"
          role="tab"
          aria-selected={activeTab === "codex"}
          aria-controls="panel-codex"
        >
          Codex
        </button>
      </header>

      <div
        className="tabs__content"
        role="tabpanel"
        id={activeTab === "claude" ? "panel-claude" : "panel-codex"}
        aria-labelledby={activeTab === "claude" ? "tab-claude" : "tab-codex"}
      >
        {activeTab === "claude" && (
          <>
            {!claudeConnected ? (
              isCheckingAuth ? (
                <div className="empty empty--loading">
                  <span className="empty__text">Connecting…</span>
                </div>
              ) : (
                <LoginPrompt provider="claude" />
              )
            ) : claudeOrgs.length > 0 ? (
              <UsagePanel orgs={claudeOrgs} />
            ) : (
              <div className="empty empty--loading">
                <span className="empty__text">Fetching usage</span>
                <button
                  className="empty__retry"
                  onClick={() => invoke("retry_connect").catch(() => {})}
                  type="button"
                >
                  Retry
                </button>
              </div>
            )}
          </>
        )}

        {activeTab === "codex" && <CodexPanel />}
      </div>
    </div>
  );
}

export default App;
