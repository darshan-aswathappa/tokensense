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

  it("applies green color class for low usage (below 60%)", () => {
    const { container } = render(
      <UsageBar label="Session" percent={30} resetAt={null} />
    );
    const fill = container.querySelector(".usage-bar__fill");
    expect(fill).toHaveClass("usage-bar__fill--green");
  });

  it("applies amber color class for medium usage (60-80%)", () => {
    const { container } = render(
      <UsageBar label="Session" percent={70} resetAt={null} />
    );
    const fill = container.querySelector(".usage-bar__fill");
    expect(fill).toHaveClass("usage-bar__fill--amber");
  });

  it("applies red color class for high usage (above 80%)", () => {
    const { container } = render(
      <UsageBar label="Session" percent={85} resetAt={null} />
    );
    const fill = container.querySelector(".usage-bar__fill");
    expect(fill).toHaveClass("usage-bar__fill--red");
  });

  it("applies amber at exactly 60%", () => {
    const { container } = render(
      <UsageBar label="Session" percent={60} resetAt={null} />
    );
    const fill = container.querySelector(".usage-bar__fill");
    expect(fill).toHaveClass("usage-bar__fill--amber");
  });

  it("applies red at exactly 80%", () => {
    const { container } = render(
      <UsageBar label="Session" percent={80} resetAt={null} />
    );
    const fill = container.querySelector(".usage-bar__fill");
    expect(fill).toHaveClass("usage-bar__fill--red");
  });

  it("shows reset time when resetAt is provided", () => {
    render(<UsageBar label="Session" percent={45} resetAt="Resets in 3h 22m" />);
    expect(screen.getByText("Resets in 3h 22m")).toBeInTheDocument();
  });

  it("does not show reset time when resetAt is null", () => {
    const { container } = render(
      <UsageBar label="Session" percent={45} resetAt={null} />
    );
    expect(container.querySelector(".usage-bar__reset")).toBeNull();
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
    const fill = container.querySelector<HTMLElement>(".usage-bar__fill");
    expect(fill?.style.width).toBe("100%");
  });
});
