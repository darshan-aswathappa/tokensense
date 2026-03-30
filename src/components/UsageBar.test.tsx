import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
    const fill = container.querySelector<HTMLElement>(".bar__fill");
    // jsdom normalizes hsl(145,62%,50%) → rgb(48, 207, 114)
    expect(fill?.style.background).toBe("rgb(48, 207, 114)");
  });

  it("applies amber color for medium usage (70-89%)", () => {
    const { container } = render(
      <UsageBar label="Session" percent={70} resetAt={null} />
    );
    const fill = container.querySelector<HTMLElement>(".bar__fill");
    // jsdom normalizes #ff8c00 → rgb(255, 140, 0)
    expect(fill?.style.background).toBe("rgb(255, 140, 0)");
  });

  it("applies red color for high usage (90%+)", () => {
    const { container } = render(
      <UsageBar label="Session" percent={92} resetAt={null} />
    );
    const fill = container.querySelector<HTMLElement>(".bar__fill");
    // jsdom normalizes hsl(0,82%,62%) → rgb(238, 79, 79)
    expect(fill?.style.background).toBe("rgb(238, 79, 79)");
  });

  it("applies amber at exactly 70%", () => {
    const { container } = render(
      <UsageBar label="Session" percent={70} resetAt={null} />
    );
    const fill = container.querySelector<HTMLElement>(".bar__fill");
    expect(fill?.style.background).toBe("rgb(255, 140, 0)");
  });

  it("applies red at exactly 90%", () => {
    const { container } = render(
      <UsageBar label="Session" percent={90} resetAt={null} />
    );
    const fill = container.querySelector<HTMLElement>(".bar__fill");
    expect(fill?.style.background).toBe("rgb(238, 79, 79)");
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
