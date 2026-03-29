import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { LoginPrompt } from "./LoginPrompt";

describe("LoginPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the connect button", () => {
    render(<LoginPrompt />);
    expect(
      screen.getByRole("button", { name: /connect claude account/i })
    ).toBeInTheDocument();
  });

  it("renders descriptive subtitle text", () => {
    render(<LoginPrompt />);
    expect(screen.getByText(/opens claude\.ai to sign in/i)).toBeInTheDocument();
  });

  it("renders monitor description text", () => {
    render(<LoginPrompt />);
    expect(screen.getByText(/monitor your claude usage/i)).toBeInTheDocument();
  });

  it("calls invoke with open_login_window when button is clicked", async () => {
    const user = userEvent.setup();
    render(<LoginPrompt />);

    const button = screen.getByRole("button", { name: /connect claude account/i });
    await user.click(button);

    expect(invoke).toHaveBeenCalledWith("open_login_window");
  });

  it("calls invoke exactly once per click", async () => {
    const user = userEvent.setup();
    render(<LoginPrompt />);

    const button = screen.getByRole("button", { name: /connect claude account/i });
    await user.click(button);
    await user.click(button);

    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("renders an icon or visual element for the Claude logo area", () => {
    const { container } = render(<LoginPrompt />);
    expect(container.querySelector(".login-prompt__icon")).toBeInTheDocument();
  });
});
