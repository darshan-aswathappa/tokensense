import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { UsagePanel } from "./UsagePanel";
import type { OrgUsage } from "../types";

const makeOrg = (
  id: string,
  name: string,
  sessionUsed: number,
  sessionLimit: number,
  weeklyUsed: number,
  weeklyLimit: number,
  sessionResetAt?: string,
  weeklyResetAt?: string,
): OrgUsage => ({
  org_id: id,
  org_name: name,
  usage: {
    session_tokens_used: sessionUsed,
    session_tokens_limit: sessionLimit,
    weekly_tokens_used: weeklyUsed,
    weekly_tokens_limit: weeklyLimit,
    session_reset_at: sessionResetAt ?? null,
    weekly_reset_at: weeklyResetAt ?? null,
    extra_usage_active: false,
  },
  error: null,
});

const singleOrg: OrgUsage[] = [
  makeOrg("org-1", "Personal", 45000, 100000, 82000, 100000, "Resets in 3h 22m", "Resets Mon at 9am"),
];

const multiOrg: OrgUsage[] = [
  makeOrg("org-1", "Northeastern University", 10000, 50000, 200000, 1000000),
  makeOrg("org-2", "Personal", 45000, 100000, 82000, 100000),
];

describe("UsagePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders session usage section", () => {
    render(<UsagePanel orgs={singleOrg} lastUpdated={null} />);
    expect(screen.getByText(/session/i)).toBeInTheDocument();
  });

  it("renders weekly usage section", () => {
    render(<UsagePanel orgs={singleOrg} lastUpdated={null} />);
    expect(screen.getByText(/weekly/i)).toBeInTheDocument();
  });

  it("calculates and displays session percentage correctly", () => {
    render(<UsagePanel orgs={singleOrg} lastUpdated={null} />);
    // 45000 / 100000 = 45%
    expect(screen.getByText("45%")).toBeInTheDocument();
  });

  it("calculates and displays weekly percentage correctly", () => {
    render(<UsagePanel orgs={singleOrg} lastUpdated={null} />);
    // 82000 / 100000 = 82%
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("shows session reset time", () => {
    render(<UsagePanel orgs={singleOrg} lastUpdated={null} />);
    expect(screen.getByText("Resets in 3h 22m")).toBeInTheDocument();
  });

  it("shows weekly reset time", () => {
    render(<UsagePanel orgs={singleOrg} lastUpdated={null} />);
    expect(screen.getByText("Resets Mon at 9am")).toBeInTheDocument();
  });

  it("shows last updated time when provided", () => {
    render(<UsagePanel orgs={singleOrg} lastUpdated={new Date()} />);
    expect(screen.getByText(/updated/i)).toBeInTheDocument();
  });

  it("shows 'never' when lastUpdated is null", () => {
    render(<UsagePanel orgs={singleOrg} lastUpdated={null} />);
    expect(screen.getByText(/never/i)).toBeInTheDocument();
  });

  it("renders a disconnect button", () => {
    render(<UsagePanel orgs={singleOrg} lastUpdated={null} />);
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
  });

  it("calls invoke disconnect when disconnect button is clicked", async () => {
    const user = userEvent.setup();
    render(<UsagePanel orgs={singleOrg} lastUpdated={null} />);
    await user.click(screen.getByRole("button", { name: /disconnect/i }));
    expect(invoke).toHaveBeenCalledWith("disconnect");
  });

  it("handles zero limit gracefully showing 0%", () => {
    const zeroOrg: OrgUsage[] = [{
      org_id: "org-0",
      org_name: "Test",
      usage: {
        session_tokens_used: 0,
        session_tokens_limit: 0,
        weekly_tokens_used: 0,
        weekly_tokens_limit: 0,
        session_reset_at: null,
        weekly_reset_at: null,
        extra_usage_active: false,
      },
      error: null,
    }];
    render(<UsagePanel orgs={zeroOrg} lastUpdated={null} />);
    const zeros = screen.getAllByText("0%");
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  it("renders two progress bars per org", () => {
    render(<UsagePanel orgs={singleOrg} lastUpdated={null} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
  });

  it("renders org names as section headers", () => {
    render(<UsagePanel orgs={multiOrg} lastUpdated={null} />);
    expect(screen.getByText("Northeastern University")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  it("renders four progress bars for two orgs", () => {
    render(<UsagePanel orgs={multiOrg} lastUpdated={null} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(4);
  });

  it("shows error message when org has an error", () => {
    const errOrg: OrgUsage[] = [{
      org_id: "org-err",
      org_name: "Broken Org",
      usage: null,
      error: "usage fetch 403",
    }];
    render(<UsagePanel orgs={errOrg} lastUpdated={null} />);
    expect(screen.getByText("usage fetch 403")).toBeInTheDocument();
  });
});
