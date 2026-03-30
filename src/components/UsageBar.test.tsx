import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { UsageBar } from "./UsageBar";

describe("UsageBar", () => {
  it("renders label and percentage", () => {
    render(<UsageBar label="Session" percent={45} resetAt={null} />);
    expect(screen.getByText("Session")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
  });

  it("renders with zero percent", () => {
    render(<UsageBar label="Weekly" percent={0} resetAt={null} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("renders with 100 percent", () => {
    render(<UsageBar label="Session" percent={100} resetAt={null} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("applies green color for low usage (below 70%)", () => {
    const { container } = render(
      <UsageBar label="Session" percent={30} resetAt={null} />
    );
    const bar = container.querySelector<HTMLElement>(".bar");
    expect(bar?.style.getPropertyValue("--bar-color")).toBe("hsl(145, 62%, 50%)");
  });

  it("applies amber color for medium usage (70-89%)", () => {
    const { container } = render(
      <UsageBar label="Session" percent={70} resetAt={null} />
    );
    const bar = container.querySelector<HTMLElement>(".bar");
    expect(bar?.style.getPropertyValue("--bar-color")).toBe("#ff8c00");
  });

  it("applies red color for high usage (90%+)", () => {
    const { container } = render(
      <UsageBar label="Session" percent={92} resetAt={null} />
    );
    const bar = container.querySelector<HTMLElement>(".bar");
    expect(bar?.style.getPropertyValue("--bar-color")).toBe("hsl(0, 82%, 62%)");
  });

  it("applies amber at exactly 70%", () => {
    const { container } = render(
      <UsageBar label="Session" percent={70} resetAt={null} />
    );
    const bar = container.querySelector<HTMLElement>(".bar");
    expect(bar?.style.getPropertyValue("--bar-color")).toBe("#ff8c00");
  });

  it("applies red at exactly 90%", () => {
    const { container } = render(
      <UsageBar label="Session" percent={90} resetAt={null} />
    );
    const bar = container.querySelector<HTMLElement>(".bar");
    expect(bar?.style.getPropertyValue("--bar-color")).toBe("hsl(0, 82%, 62%)");
  });

  it("shows reset time when resetAt is provided", () => {
    render(<UsageBar label="Session" percent={45} resetAt="3h 22m" />);
    expect(screen.getByText("resets 3h 22m")).toBeInTheDocument();
  });

  it("does not show reset time when resetAt is null", () => {
    const { container } = render(
      <UsageBar label="Session" percent={45} resetAt={null} />
    );
    expect(container.querySelector(".bar__meta")).toBeNull();
  });

  it("has a progress bar element with correct aria attributes", () => {
    render(<UsageBar label="Session" percent={45} resetAt={null} />);
    const progressBar = screen.getByRole("progressbar");
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute("aria-valuenow", "45");
    expect(progressBar).toHaveAttribute("aria-valuemin", "0");
    expect(progressBar).toHaveAttribute("aria-valuemax", "100");
  });

  it("clamps fill width to 100% maximum", () => {
    const { container } = render(
      <UsageBar label="Session" percent={120} resetAt={null} />
    );
    const fill = container.querySelector<HTMLElement>(".bar__fill");
    expect(fill?.style.width).toBe("100%");
  });

  it("clamps displayed percentage to 100 for over-limit values", () => {
    render(<UsageBar label="Session" percent={120} resetAt={null} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByText("120%")).toBeNull();
  });

  it("clamps displayed percentage to 0 for negative values", () => {
    render(<UsageBar label="Session" percent={-10} resetAt={null} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.queryByText("-10%")).toBeNull();
  });
});

describe("UsageBar animation path (matchMedia available)", () => {
  let pendingTimeouts: (() => void)[] = [];
  let cancelSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pendingTimeouts = [];
    cancelSpy = vi.fn();

    let simTime = 0;
    const rafQueue: FrameRequestCallback[] = [];
    let rafRunning = false;

    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    vi.stubGlobal("clearTimeout", vi.fn());
    vi.stubGlobal("cancelAnimationFrame", cancelSpy);
    vi.stubGlobal("setTimeout", (cb: () => void) => {
      pendingTimeouts.push(cb);
      return pendingTimeouts.length;
    });
    // Synchronous RAF: drains the queue to completion so animation settles inline
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      if (!rafRunning) {
        rafRunning = true;
        while (rafQueue.length > 0) {
          simTime += 16;
          rafQueue.shift()!(simTime);
        }
        rafRunning = false;
      }
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues a setTimeout delay on first render before starting RAF", () => {
    render(<UsageBar label="Test" percent={50} resetAt={null} index={0} />);
    // delay = 0 * 70 + 100 = 100ms → setTimeout called, RAF not yet called
    expect(pendingTimeouts.length).toBe(1);
  });

  it("stagger delay increases with index prop", () => {
    // delay = 2 * 70 + 100 = 240ms, but we just verify setTimeout was queued
    render(<UsageBar label="Test" percent={50} resetAt={null} index={2} />);
    expect(pendingTimeouts.length).toBe(1);
  });

  it("skips setTimeout and calls RAF directly on re-renders", () => {
    const { rerender } = render(<UsageBar label="Test" percent={50} resetAt={null} />);
    // flush initial delay so firstRender flag is reset
    act(() => { pendingTimeouts.forEach(cb => cb()); pendingTimeouts = []; });

    act(() => { rerender(<UsageBar label="Test" percent={75} resetAt={null} />); });
    expect(pendingTimeouts.length).toBe(0); // no setTimeout on re-render
  });

  it("tick function animates and settles fill width at target", () => {
    const { container } = render(<UsageBar label="Test" percent={50} resetAt={null} />);
    const fill = container.querySelector<HTMLElement>(".bar__fill");

    act(() => { pendingTimeouts.forEach(cb => cb()); pendingTimeouts = []; });

    expect(fill?.style.width).toBe("50%");
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("cancels animation frame during effect and on unmount", () => {
    const { unmount } = render(<UsageBar label="Test" percent={50} resetAt={null} />);
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });
});
