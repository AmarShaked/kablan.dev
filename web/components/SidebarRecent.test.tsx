import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SidebarRecent } from "./SidebarRecent.tsx";
import type { ProjectEntity } from "../lib/projectEntities.ts";

function feature(overrides: Partial<ProjectEntity> = {}): ProjectEntity {
  return { kind: "feature", id: "f1", label: "Feature One", ts: 100, featureId: "f1", ...overrides };
}

function taskForceEntity(overrides: Partial<ProjectEntity> = {}): ProjectEntity {
  return {
    kind: "taskForce",
    id: "t1",
    label: "TF One",
    branch: "feat/one",
    ts: 100,
    featureId: "f1",
    taskForceId: "t1",
    ...overrides,
  };
}

function worktreeEntity(overrides: Partial<ProjectEntity> = {}): ProjectEntity {
  return {
    kind: "worktree",
    id: "/wt/one",
    label: "one",
    sublabel: "/wt/one",
    branch: "feat/one",
    ts: 100,
    worktreePath: "/wt/one",
    ...overrides,
  };
}

function branchEntity(overrides: Partial<ProjectEntity> = {}): ProjectEntity {
  return { kind: "branch", id: "main", label: "main", branch: "main", ts: 100, isCurrent: false, ...overrides };
}

function renderComponent(overrides: Partial<Parameters<typeof SidebarRecent>[0]> = {}) {
  const props = {
    features: [feature()],
    taskForces: [] as ProjectEntity[],
    worktrees: [worktreeEntity()],
    branches: [branchEntity()],
    unreadFor: vi.fn(() => 0),
    onOpenFeature: vi.fn(),
    onOpenTaskForce: vi.fn(),
    onOpenBranch: vi.fn(),
    onOpenWorktree: vi.fn(),
    onViewAll: vi.fn(),
    ...overrides,
  };
  render(<SidebarRecent {...props} />);
  return props;
}

describe("SidebarRecent", () => {
  it("renders all three group labels and their entities", () => {
    renderComponent();
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Worktrees")).toBeInTheDocument();
    expect(screen.getByText("Branches")).toBeInTheDocument();
    expect(screen.getByText("Feature One")).toBeInTheDocument();
    expect(screen.getByText("one")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("filters all three groups by the filter input", async () => {
    renderComponent({
      features: [feature({ label: "Login flow" }), feature({ id: "f2", featureId: "f2", label: "Zzz other" })],
    });
    expect(screen.getByText("Login flow")).toBeInTheDocument();
    expect(screen.getByText("Zzz other")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/find a feature/i), "login");

    expect(screen.getByText("Login flow")).toBeInTheDocument();
    expect(screen.queryByText("Zzz other")).not.toBeInTheDocument();
  });

  it("clicking a feature row calls onOpenFeature with the feature id", async () => {
    const props = renderComponent();
    await userEvent.click(screen.getByText("Feature One"));
    expect(props.onOpenFeature).toHaveBeenCalledWith("f1");
  });

  it("shows an unread badge on a feature when unreadFor > 0", () => {
    renderComponent({ unreadFor: vi.fn(() => 3) });
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("expanding a feature shows its task forces, and clicking one calls onOpenTaskForce", async () => {
    const props = renderComponent({ taskForces: [taskForceEntity()] });
    expect(screen.queryByText("TF One")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Feature One"));
    expect(screen.getByText("TF One")).toBeInTheDocument();

    await userEvent.click(screen.getByText("TF One"));
    expect(props.onOpenTaskForce).toHaveBeenCalledWith("f1", "t1");
  });

  it("collapses a feature's task forces when clicked again", async () => {
    renderComponent({ taskForces: [taskForceEntity()] });
    await userEvent.click(screen.getByText("Feature One"));
    expect(screen.getByText("TF One")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Feature One"));
    expect(screen.queryByText("TF One")).not.toBeInTheDocument();
  });

  it("shows 'No task forces.' when an expanded feature has none", async () => {
    renderComponent();
    await userEvent.click(screen.getByText("Feature One"));
    expect(screen.getByText("No task forces.")).toBeInTheDocument();
  });

  it("clicking a worktree row with no taskForceId calls onOpenWorktree with the entity", async () => {
    const props = renderComponent();
    await userEvent.click(screen.getByText("one"));
    expect(props.onOpenWorktree).toHaveBeenCalledWith(expect.objectContaining({ id: "/wt/one" }));
    expect(props.onOpenTaskForce).not.toHaveBeenCalled();
  });

  it("clicking a worktree row with a taskForceId calls onOpenTaskForce instead", async () => {
    const props = renderComponent({
      worktrees: [worktreeEntity({ taskForceId: "t1", featureId: "f1" })],
    });
    await userEvent.click(screen.getByText("one"));
    expect(props.onOpenTaskForce).toHaveBeenCalledWith("f1", "t1");
    expect(props.onOpenWorktree).not.toHaveBeenCalled();
  });

  it("clicking a branch row calls onOpenBranch with the branch name", async () => {
    const props = renderComponent();
    await userEvent.click(screen.getByText("main"));
    expect(props.onOpenBranch).toHaveBeenCalledWith("main");
  });

  it('shows a "View all" row when a filtered group has more than 10 items, wired to onViewAll', async () => {
    const manyBranches = Array.from({ length: 12 }, (_, i) =>
      branchEntity({ id: `b${i}`, label: `branch-${i}`, branch: `branch-${i}`, ts: 100 - i }),
    );
    const props = renderComponent({ branches: manyBranches });

    const viewAllRows = screen.getAllByText(/view all/i);
    expect(viewAllRows.length).toBeGreaterThan(0);
    await userEvent.click(viewAllRows[0]);
    expect(props.onViewAll).toHaveBeenCalledWith("branches");
  });

  it("does not show a View all row when a group has 10 or fewer items", () => {
    renderComponent();
    expect(screen.queryByText(/view all/i)).not.toBeInTheDocument();
  });

  it("caps each group's rendered rows at 10", () => {
    const manyFeatures = Array.from({ length: 15 }, (_, i) =>
      feature({ id: `f${i}`, featureId: `f${i}`, label: `Feature ${i}`, ts: 100 - i }),
    );
    renderComponent({ features: manyFeatures });
    for (let i = 0; i < 10; i++) expect(screen.getByText(`Feature ${i}`)).toBeInTheDocument();
    for (let i = 10; i < 15; i++) expect(screen.queryByText(`Feature ${i}`)).not.toBeInTheDocument();
  });

  it("does not render a Fetch button when onFetch is omitted", () => {
    renderComponent();
    expect(screen.queryByLabelText(/fetch remote/i)).not.toBeInTheDocument();
  });

  it("renders a Fetch button in the Worktrees group and fires onFetch when clicked", async () => {
    const onFetch = vi.fn().mockResolvedValue(undefined);
    renderComponent({ onFetch });
    const button = screen.getByLabelText(/fetch remote/i);
    await userEvent.click(button);
    expect(onFetch).toHaveBeenCalled();
  });
});
