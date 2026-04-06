import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CodexPanel } from "./components/CodexPanel";
import { LoginPrompt } from "./components/LoginPrompt";
import { UsagePanel } from "./components/UsagePanel";
import { SettingsPanel } from "./components/SettingsPanel";
import type { OrgUsage } from "./types";
import "./App.css";

type Provider = "claude" | "codex";
type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function App() {
  const [activeTab, setActiveTab] = useState<Provider>("claude");
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

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

  const handleThemeChange = useCallback((next: Theme) => {
    setTheme(next);
    localStorage.setItem("theme", next);
  }, []);

  const handleTabClick = useCallback((tab: Provider) => {
    setActiveTab(tab);
    setShowSettings(false);
  }, []);

  const handleGearClick = useCallback(() => {
    setShowSettings((prev) => !prev);
  }, []);

  const panelId = activeTab === "claude" ? "panel-claude" : "panel-codex";
  const tabLabelId = activeTab === "claude" ? "tab-claude" : "tab-codex";

  return (
    <div className="app" data-theme={theme}>
      <header className="tabs" role="tablist">
        <button
          id="tab-claude"
          className={`tabs__btn ${activeTab === "claude" && !showSettings ? "tabs__btn--active" : ""}`}
          onClick={() => handleTabClick("claude")}
          type="button"
          role="tab"
          aria-selected={activeTab === "claude" && !showSettings}
          aria-controls="panel-claude"
        >
          Claude
        </button>
        <button
          id="tab-codex"
          className={`tabs__btn ${activeTab === "codex" && !showSettings ? "tabs__btn--active" : ""}`}
          onClick={() => handleTabClick("codex")}
          type="button"
          role="tab"
          aria-selected={activeTab === "codex" && !showSettings}
          aria-controls="panel-codex"
        >
          Codex
        </button>
        <button
          className={`settings__gear-btn${showSettings ? " settings__gear-btn--active" : ""}`}
          onClick={handleGearClick}
          type="button"
          aria-label="Settings"
          aria-pressed={showSettings}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 15 15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {/* Three horizontal slider lines */}
            <line x1="1.5" y1="3.5" x2="13.5" y2="3.5" />
            <line x1="1.5" y1="7.5" x2="13.5" y2="7.5" />
            <line x1="1.5" y1="11.5" x2="13.5" y2="11.5" />
            {/* Slider knobs */}
            <circle cx="4.5" cy="3.5" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="9.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="6" cy="11.5" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </header>

      <div
        className="tabs__content"
        role="tabpanel"
        id={showSettings ? "panel-settings" : panelId}
        aria-labelledby={showSettings ? undefined : tabLabelId}
      >
        {showSettings ? (
          <SettingsPanel
            theme={theme}
            onThemeChange={handleThemeChange}
            claudeConnected={claudeConnected}
          />
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

export default App;
