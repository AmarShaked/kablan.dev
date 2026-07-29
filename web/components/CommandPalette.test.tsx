import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { CommandPalette } from "./CommandPalette.tsx";
import type { BranchEntity } from "../lib/projectEntities.ts";

function branchEntity(overrides: Partial<BranchEntity> = {}): BranchEntity {
  return {
    name: "main",
    hasWorktree: false,
    serverRunning: false,
    isCurrent: false,
    dirty: false,
    ts: 100,
    ...overrides,
  };
}

const branches: BranchEntity[] = [
  branchEntity({ name: "main", ts: 300 }),
  branchEntity({ name: "feat/login", ts: 200, agentStatus: "awaitingInput" }),
  branchEntity({ name: "feat/one", ts: 100 }),
];

function renderPalette(overrides: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    branches,
    onSelect: vi.fn(),
    ...overrides,
  };
  render(<CommandPalette {...props} />);
  return props;
}

describe("CommandPalette", () => {
  it("shows all branches when the query is empty", () => {
    renderPalette();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("feat/login")).toBeInTheDocument();
    expect(screen.getByText("feat/one")).toBeInTheDocument();
    expect(screen.getByText("Branches")).toBeInTheDocument();
  });

  it("autofocuses the search input on open", async () => {
    renderPalette();
    await waitFor(() => expect(screen.getByRole("searchbox")).toHaveFocus());
  });

  it("typing filters results by branch name", async () => {
    renderPalette();
    await userEvent.type(screen.getByRole("searchbox"), "login");

    expect(screen.getByText("feat/login")).toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();
    expect(screen.queryByText("feat/one")).not.toBeInTheDocument();
  });

  it("ArrowDown then Enter selects the second visible result", async () => {
    const props = renderPalette();
    const input = screen.getByRole("searchbox");
    input.focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(props.onSelect).toHaveBeenCalledWith("feat/login");
  });

  it("Enter with no navigation selects the first visible result", async () => {
    const props = renderPalette();
    screen.getByRole("searchbox").focus();
    await userEvent.keyboard("{Enter}");
    expect(props.onSelect).toHaveBeenCalledWith("main");
  });

  it("clicking a result calls onSelect with that branch's name", async () => {
    const props = renderPalette();
    await userEvent.click(screen.getByText("feat/one"));
    expect(props.onSelect).toHaveBeenCalledWith("feat/one");
  });

  it("Escape closes the palette", async () => {
    const props = renderPalette();
    screen.getByRole("searchbox").focus();
    await userEvent.keyboard("{Escape}");
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows nothing (no dialog content) when closed", () => {
    renderPalette({ open: false });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("shows 'No results.' when the query matches nothing", async () => {
    renderPalette();
    await userEvent.type(screen.getByRole("searchbox"), "nonexistent");
    expect(screen.getByText("No results.")).toBeInTheDocument();
  });
});
