import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { GlobalRail } from "./GlobalRail.tsx";

function renderRail(overrides: Partial<Parameters<typeof GlobalRail>[0]> = {}) {
  const props = {
    inboxCount: 0,
    active: null,
    onHome: vi.fn(),
    onInbox: vi.fn(),
    onSettings: vi.fn(),
    theme: "dark" as const,
    onToggleTheme: vi.fn(),
    ...overrides,
  };
  render(<GlobalRail {...props} />);
  return props;
}

describe("GlobalRail", () => {
  it("renders Home, Inbox and Settings items with no badge when inboxCount is 0", () => {
    renderRail();
    expect(screen.getByLabelText("Home")).toBeInTheDocument();
    expect(screen.getByLabelText("Inbox")).toBeInTheDocument();
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("places Home first, before Inbox and Settings", () => {
    renderRail();
    const labels = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    const homeIdx = labels.indexOf("Home");
    const inboxIdx = labels.indexOf("Inbox");
    const settingsIdx = labels.indexOf("Settings");
    expect(homeIdx).toBeLessThan(inboxIdx);
    expect(inboxIdx).toBeLessThan(settingsIdx);
  });

  it("fires onHome when Home is clicked", async () => {
    const props = renderRail();
    await userEvent.click(screen.getByLabelText("Home"));
    expect(props.onHome).toHaveBeenCalled();
  });

  it("marks Home current when active is 'home'", () => {
    renderRail({ active: "home" });
    expect(screen.getByLabelText("Home")).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Inbox")).not.toHaveAttribute("aria-current");
  });

  it("shows an unread badge on Inbox when inboxCount > 0", () => {
    renderRail({ inboxCount: 4 });
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("caps a large inbox count at 99+", () => {
    renderRail({ inboxCount: 150 });
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("fires onInbox when Inbox is clicked", async () => {
    const props = renderRail();
    await userEvent.click(screen.getByLabelText("Inbox"));
    expect(props.onInbox).toHaveBeenCalled();
  });

  it("fires onSettings when Settings is clicked", async () => {
    const props = renderRail();
    await userEvent.click(screen.getByLabelText("Settings"));
    expect(props.onSettings).toHaveBeenCalled();
  });

  it("fires onToggleTheme when the theme button is clicked", async () => {
    const props = renderRail();
    await userEvent.click(screen.getByLabelText("Theme"));
    expect(props.onToggleTheme).toHaveBeenCalled();
  });

  it("marks the active item current", () => {
    renderRail({ active: "settings" });
    expect(screen.getByLabelText("Settings")).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Inbox")).not.toHaveAttribute("aria-current");
  });
});
