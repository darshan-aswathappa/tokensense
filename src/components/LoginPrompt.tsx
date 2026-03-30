import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  provider: "claude" | "codex";
}

const LABELS = {
  claude: {
    desc: "Sign in to see real-time token usage across your Claude organizations.",
    btn: "Sign in with Claude",
  },
  codex: {
    desc: "Coming soon.",
    btn: "Sign in with Codex",
  },
};

export function LoginPrompt({ provider }: Props) {
  const { desc, btn } = LABELS[provider];
  const [isOpening, setIsOpening] = useState(false);

  const handleLogin = () => {
    if (provider === "claude" && !isOpening) {
      setIsOpening(true);
      void Promise.resolve(invoke("open_login_window")).finally(() => setIsOpening(false));
    }
  };

  return (
    <div className="login">
      <p className="login__desc">{desc}</p>
      <button
        className={`login__btn${isOpening ? " login__btn--loading" : ""}`}
        onClick={handleLogin}
        disabled={provider === "codex" || isOpening}
        type="button"
      >
        {isOpening ? "Opening…" : btn}
      </button>
    </div>
  );
}
