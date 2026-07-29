import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { GlobalRail } from "./GlobalRail.tsx";

function renderRail(overrides: Partial<Parameters<typeof GlobalRail>[0]> = {}) {
  const props = {
    inboxCount: 0,
    active: null,
    onInbox: vi.fn(),
    onSettings: vi.fn(),
    onActivity: vi.fn(),
    theme: "dark" as const,
    onToggleTheme: vi.fn(),
    ...overrides,
  };
  render(<GlobalRail {...props} />);
  return props;
}

describe("GlobalRail", () => {
  it("renders Inbox, Activity and Settings items with no badge when inboxCount is 0", () => {
    renderRail();
    expect(screen.getByLabelText("Inbox")).toBeInTheDocument();
    expect(screen.getByLabelText("Activity")).toBeInTheDocument();
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("places Activity between Inbox and Settings", () => {
    renderRail();
    const labels = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    const inboxIdx = labels.indexOf("Inbox");
    const activityIdx = labels.indexOf("Activity");
    const settingsIdx = labels.indexOf("Settings");
    expect(inboxIdx).toBeLessThan(activityIdx);
    expect(activityIdx).toBeLessThan(settingsIdx);
  });

  it("fires onActivity when Activity is clicked", async () => {
    const props = renderRail();
    await userEvent.click(screen.getByLabelText("Activity"));
    expect(props.onActivity).toHaveBeenCalled();
  });

  it("marks Activity current when active is 'activity'", () => {
    renderRail({ active: "activity" });
    expect(screen.getByLabelText("Activity")).toHaveAttribute("aria-current", "page");
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
