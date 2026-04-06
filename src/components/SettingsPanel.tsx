import { memo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

type Theme = "light" | "dark";

interface Props {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  claudeConnected: boolean;
}

export const SettingsPanel = memo(function SettingsPanel({
  theme,
  onThemeChange,
  claudeConnected,
}: Props) {
  const disconnect = useCallback(() => invoke("disconnect"), []);

  const handleThemeToggle = useCallback(() => {
    onThemeChange(theme === "dark" ? "light" : "dark");
  }, [theme, onThemeChange]);

  return (
    <div className="settings">
      <div>
        <span className="settings__section-label">Appearance</span>
        <div className="settings__row">
          <span className="settings__row-label">Dark mode</span>
          <button
            className="settings__toggle"
            role="switch"
            aria-checked={theme === "dark"}
            onClick={handleThemeToggle}
            type="button"
            aria-label="Toggle dark mode"
          >
            <span className="settings__toggle-thumb" />
          </button>
        </div>
      </div>

      <div>
        <span className="settings__section-label">Connections</span>
        {claudeConnected ? (
          <div className="settings__row">
            <span className="settings__row-label">Claude</span>
            <button
              className="settings__disconnect"
              onClick={disconnect}
              type="button"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="settings__row">
            <span className="settings__row-label" style={{ color: "var(--text-muted)" }}>
              No active connections
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
