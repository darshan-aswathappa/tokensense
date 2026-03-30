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

// Use fixed future ISO timestamps: +3h22m and +6d for session/weekly
const SESSION_RESET_ISO = new Date(Date.now() + 3 * 60 * 60 * 1000 + 22 * 60 * 1000).toISOString();
const WEEKLY_RESET_ISO  = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

const singleOrg: OrgUsage[] = [
  makeOrg("org-1", "Personal", 45000, 100000, 82000, 100000, SESSION_RESET_ISO, WEEKLY_RESET_ISO),
];

const multiOrg: OrgUsage[] = [
  makeOrg("org-1", "Northeastern University", 10000, 50000, 200000, 1000000),
  makeOrg("org-2", "Personal", 45000, 100000, 82000, 100000),
];

describe("UsagePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 5-hour session usage bar", () => {
    render(<UsagePanel orgs={singleOrg}  />);
    expect(screen.getByText("5-hour")).toBeInTheDocument();
  });

  it("renders 7-day weekly usage bar", () => {
    render(<UsagePanel orgs={singleOrg}  />);
    expect(screen.getByText("7-day")).toBeInTheDocument();
  });

  it("calculates and displays session percentage correctly", () => {
    render(<UsagePanel orgs={singleOrg}  />);
    // 45000 / 100000 = 45%
    expect(screen.getByText("45%")).toBeInTheDocument();
  });

  it("calculates and displays weekly percentage correctly", () => {
    render(<UsagePanel orgs={singleOrg}  />);
    // 82000 / 100000 = 82%
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("shows session reset time when provided", () => {
    render(<UsagePanel orgs={singleOrg}  />);
    // relativeReset produces e.g. "3h 22m" or "3h 21m" depending on clock
    const metas = screen.getAllByText(/^resets /);
    expect(metas.length).toBeGreaterThanOrEqual(1);
  });

  it("shows weekly reset time when provided", () => {
    render(<UsagePanel orgs={singleOrg}  />);
    const metas = screen.getAllByText(/^resets /);
    expect(metas.length).toBeGreaterThanOrEqual(2);
  });

  it("renders a disconnect button", () => {
    render(<UsagePanel orgs={singleOrg}  />);
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
  });

  it("calls invoke disconnect when disconnect button is clicked", async () => {
    const user = userEvent.setup();
    render(<UsagePanel orgs={singleOrg}  />);
    await user.click(screen.getByRole("button", { name: /disconnect/i }));
    expect(invoke).toHaveBeenCalledWith("disconnect");
  });

  it("hides usage bars when limits are zero", () => {
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
    render(<UsagePanel orgs={zeroOrg}  />);
    expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
  });

  it("renders two progress bars per org", () => {
    render(<UsagePanel orgs={singleOrg}  />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
  });

  it("renders org names as section headers", () => {
    render(<UsagePanel orgs={multiOrg}  />);
    expect(screen.getByText("Northeastern University")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  it("renders four progress bars for two orgs", () => {
    render(<UsagePanel orgs={multiOrg}  />);
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
    render(<UsagePanel orgs={errOrg}  />);
    expect(screen.getByText("usage fetch 403")).toBeInTheDocument();
  });
});
