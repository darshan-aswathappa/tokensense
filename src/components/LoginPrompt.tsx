import { invoke } from "@tauri-apps/api/core";

interface Props {
  provider: "claude" | "codex";
}

const LABELS = {
  claude: {
    desc: "Connect to monitor your Claude usage.",
    btn: "Sign in with Claude",
  },
  codex: {
    desc: "Connect to monitor your Codex usage.",
    btn: "Sign in with Codex",
  },
};

export function LoginPrompt({ provider }: Props) {
  const { desc, btn } = LABELS[provider];

  const handleLogin = () => {
    if (provider === "claude") {
      invoke("open_login_window");
    }
    // codex login will be wired later
  };

  return (
    <div className="login">
      <p className="login__desc">{desc}</p>
      <button
        className="login__btn"
        onClick={handleLogin}
        disabled={provider === "codex"}
        type="button"
      >
        {btn}
      </button>
      {provider === "codex" && (
        <span className="login__hint">Coming soon</span>
      )}
    </div>
  );
}
