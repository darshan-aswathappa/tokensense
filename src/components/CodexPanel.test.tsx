import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { CodexPanel } from "./CodexPanel";
import type { CodexReadResult } from "../types";

vi.mocked(invoke);

const MOCK_SESSION: CodexReadResult = {
  session: {
    session_id: "test-session-id",
    timestamp: "rollout-2026-03-29T23-08-07-test.jsonl",
    model: null,
    plan_type: "go",
    total_tokens: 8884,
    input_tokens: 8878,
    output_tokens: 6,
    cached_input_tokens: 7808,
    reasoning_output_tokens: 0,
    context_window: 258400,
    rate_limit_used_percent: 0.0,
    rate_limit_window_minutes: 10080,
  },
  error: null,
};

const MOCK_NO_SESSION: CodexReadResult = {
  session: null,
  error: null,
};

const MOCK_ERROR: CodexReadResult = {
  session: null,
  error: "Failed to read session file",
};

describe("CodexPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls read_codex_session automatically on mount", () => {
    vi.mocked(invoke).mockResolvedValueOnce(MOCK_SESSION);
    render(<CodexPanel />);
    expect(invoke).toHaveBeenCalledWith("read_codex_session");
  });

  it("shows loading state initially", () => {
    vi.mocked(invoke).mockReturnValueOnce(new Promise(() => {})); // never resolves
    render(<CodexPanel />);
    expect(screen.getByText(/reading sessions/i)).toBeInTheDocument();
  });

  it("displays token usage after successful load", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(MOCK_SESSION);
    render(<CodexPanel />);

    expect(await screen.findByText("8,884")).toBeInTheDocument();
    expect(screen.getByText("8,878")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("7,808")).toBeInTheDocument();
  });

  it("shows no sessions message when none found", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(MOCK_NO_SESSION);
    render(<CodexPanel />);

    expect(
      await screen.findByText(/no recent sessions/i)
    ).toBeInTheDocument();
  });

  it("shows error message on failure", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(MOCK_ERROR);
    render(<CodexPanel />);

    expect(
      await screen.findByText(/failed to read session file/i)
    ).toBeInTheDocument();
  });

  it("shows plan type when available", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(MOCK_SESSION);
    render(<CodexPanel />);

    expect(await screen.findByText(/go/i)).toBeInTheDocument();
  });

  it("allows refreshing after initial load", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(MOCK_SESSION)
      .mockResolvedValueOnce(MOCK_SESSION);
    const user = userEvent.setup();

    render(<CodexPanel />);
    await screen.findByText("8,884");

    const refreshBtn = screen.getByRole("button", { name: /refresh/i });
    await user.click(refreshBtn);

    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("handles invoke rejection gracefully", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("Tauri error"));
    render(<CodexPanel />);

    expect(
      await screen.findByText(/tauri error/i)
    ).toBeInTheDocument();
  });
});
