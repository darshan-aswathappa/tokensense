import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { LoginPrompt } from "./LoginPrompt";

describe("LoginPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the sign in button for claude", () => {
    render(<LoginPrompt provider="claude" />);
    expect(
      screen.getByRole("button", { name: /sign in with claude/i })
    ).toBeInTheDocument();
  });

  it("renders descriptive text for claude", () => {
    render(<LoginPrompt provider="claude" />);
    expect(screen.getByText(/sign in to see real-time token usage/i)).toBeInTheDocument();
  });

  it("renders the sign in button for codex as disabled", () => {
    render(<LoginPrompt provider="codex" />);
    expect(
      screen.getByRole("button", { name: /sign in with codex/i })
    ).toBeDisabled();
  });

  it("calls invoke with open_login_window when claude button is clicked", async () => {
    const user = userEvent.setup();
    render(<LoginPrompt provider="claude" />);

    const button = screen.getByRole("button", { name: /sign in with claude/i });
    await user.click(button);

    expect(invoke).toHaveBeenCalledWith("open_login_window");
  });

  it("calls invoke exactly once per click", async () => {
    const user = userEvent.setup();
    render(<LoginPrompt provider="claude" />);

    const button = screen.getByRole("button", { name: /sign in with claude/i });
    await user.click(button);
    await user.click(button);

    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
