import type React from "react";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  provider: "claude" | "codex";
}

function GhostBar({ label, width, index }: { label: string; width: number; index: number }) {
  return (
    <div className="onboard__bar" style={{ "--i": index } as React.CSSProperties}>
      <div className="onboard__bar-row">
        <span className="onboard__bar-label">{label}</span>
        <span className="onboard__bar-pct">—%</span>
      </div>
      <div className="onboard__track">
        <div className="onboard__fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function LoginPrompt({ provider }: Props) {
  const [isOpening, setIsOpening] = useState(false);

  const handleLogin = () => {
    if (provider === "claude" && !isOpening) {
      setIsOpening(true);
      void Promise.resolve(invoke("open_login_window")).finally(() => setIsOpening(false));
    }
  };

  if (provider === "codex") {
    return (
      <div className="onboard onboard--codex">
        <span className="onboard__label">CODEX · PENDING</span>
        <div className="onboard__ghost-grid">
          {(["Total", "Input", "Output", "Cached"] as const).map((stat) => (
            <div key={stat} className="onboard__ghost-stat">
              <span className="onboard__ghost-label">{stat}</span>
              <span className="onboard__ghost-value">─</span>
            </div>
          ))}
        </div>
        <span className="onboard__note">Session token tracking coming soon</span>
      </div>
    );
  }

  return (
    <div className="onboard onboard--claude">
      <div className="onboard__header">
        <span className="onboard__title">Token Usage</span>
        <span className="onboard__subtitle">real-time · per org</span>
      </div>
      <div className="onboard__preview">
        <GhostBar label="5-hour" width={62} index={0} />
        <GhostBar label="7-day" width={38} index={1} />
      </div>
      <button
        className={`login__btn${isOpening ? " login__btn--loading" : ""}`}
        onClick={handleLogin}
        disabled={isOpening}
        type="button"
      >
        {isOpening ? "Opening…" : "Sign in with Claude"}
      </button>
    </div>
  );
}
