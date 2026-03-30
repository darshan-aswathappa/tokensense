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

  it("renders ghost preview bars for claude", () => {
    render(<LoginPrompt provider="claude" />);
    expect(screen.getByText("5-hour")).toBeInTheDocument();
    expect(screen.getByText("7-day")).toBeInTheDocument();
  });

  it("renders pending state for codex with no button", () => {
    render(<LoginPrompt provider="codex" />);
    expect(screen.getByText(/codex · pending/i)).toBeInTheDocument();
    expect(screen.getByText(/session token tracking coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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
