import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { CommandPalette } from "./CommandPalette.tsx";
import type { ProjectEntity } from "../lib/projectEntities.ts";

const features: ProjectEntity[] = [
  { kind: "feature", id: "f1", label: "Billing redesign", ts: 300, featureId: "f1" },
  { kind: "feature", id: "f2", label: "Onboarding flow", ts: 200, featureId: "f2" },
];
const taskForces: ProjectEntity[] = [
  { kind: "taskForce", id: "t1", label: "Login TF", branch: "feat/login", ts: 150, featureId: "f2", taskForceId: "t1" },
];
const branches: ProjectEntity[] = [
  { kind: "branch", id: "main", label: "main", branch: "main", ts: 100 },
];
const worktrees: ProjectEntity[] = [
  { kind: "worktree", id: "/wt/one", label: "one", branch: "feat/one", ts: 90, worktreePath: "/wt/one" },
];

function renderPalette(overrides: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    entities: { features, taskForces, branches, worktrees },
    onSelect: vi.fn(),
    ...overrides,
  };
  render(<CommandPalette {...props} />);
  return props;
}

describe("CommandPalette", () => {
  it("shows all groups with all entities when the query is empty", () => {
    renderPalette();
    expect(screen.getByText("Billing redesign")).toBeInTheDocument();
    expect(screen.getByText("Onboarding flow")).toBeInTheDocument();
    expect(screen.getByText("Login TF")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("one")).toBeInTheDocument();
  });

  it("renders grouped headers by kind", () => {
    renderPalette();
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Task Forces")).toBeInTheDocument();
    expect(screen.getByText("Branches")).toBeInTheDocument();
    expect(screen.getByText("Worktrees")).toBeInTheDocument();
  });

  it("autofocuses the search input on open", async () => {
    renderPalette();
    await waitFor(() => expect(screen.getByRole("searchbox")).toHaveFocus());
  });

  it("typing filters results across all groups", async () => {
    renderPalette();
    await userEvent.type(screen.getByRole("searchbox"), "login");

    expect(screen.getByText("Login TF")).toBeInTheDocument();
    expect(screen.queryByText("Billing redesign")).not.toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();
  });

  it("ArrowDown then Enter selects the second visible result", async () => {
    const props = renderPalette();
    const input = screen.getByRole("searchbox");
    input.focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");

    // Flattened order follows group order: features, taskForces, branches, worktrees.
    // First item is Billing redesign (f1); ArrowDown moves to Onboarding flow (f2).
    expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "f2" }));
  });

  it("Enter with no navigation selects the first visible result", async () => {
    const props = renderPalette();
    screen.getByRole("searchbox").focus();
    await userEvent.keyboard("{Enter}");
    expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "f1" }));
  });

  it("clicking a result calls onSelect with that entity", async () => {
    const props = renderPalette();
    await userEvent.click(screen.getByText("main"));
    expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "main" }));
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
});
