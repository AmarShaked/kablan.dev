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

  it('does not show a "View all" row even when a filtered group has more than 10 items', () => {
    const manyBranches = Array.from({ length: 12 }, (_, i) =>
      branchEntity({ id: `b${i}`, label: `branch-${i}`, branch: `branch-${i}`, ts: 100 - i }),
    );
    renderComponent({ branches: manyBranches });
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

  describe("loading skeletons", () => {
    it("shows 4 skeleton rows for Features while loading with no features yet, and hides the empty state", () => {
      renderComponent({ features: [], featuresLoading: true });
      expect(screen.getAllByTestId("skeleton-row-features")).toHaveLength(4);
      expect(screen.queryByText("No features.")).not.toBeInTheDocument();
    });

    it("does not show Features skeletons once features have loaded", () => {
      renderComponent({ featuresLoading: false });
      expect(screen.queryByTestId("skeleton-row-features")).not.toBeInTheDocument();
      expect(screen.getByText("Feature One")).toBeInTheDocument();
    });

    it("does not show Features skeletons when loading but entities are already present", () => {
      renderComponent({ featuresLoading: true });
      expect(screen.queryByTestId("skeleton-row-features")).not.toBeInTheDocument();
      expect(screen.getByText("Feature One")).toBeInTheDocument();
    });

    it("shows 4 skeleton rows for Worktrees while loading with no worktrees yet, and hides the empty state", () => {
      renderComponent({ worktrees: [], worktreesLoading: true });
      expect(screen.getAllByTestId("skeleton-row-worktrees")).toHaveLength(4);
      expect(screen.queryByText("No worktrees.")).not.toBeInTheDocument();
    });

    it("does not show Worktrees skeletons once worktrees have loaded", () => {
      renderComponent({ worktreesLoading: false });
      expect(screen.queryByTestId("skeleton-row-worktrees")).not.toBeInTheDocument();
      expect(screen.getByText("one")).toBeInTheDocument();
    });

    it("shows 4 skeleton rows for Branches while loading with no branches yet, and hides the empty state", () => {
      renderComponent({ branches: [], branchesLoading: true });
      expect(screen.getAllByTestId("skeleton-row-branches")).toHaveLength(4);
      expect(screen.queryByText("No branches.")).not.toBeInTheDocument();
    });

    it("does not show Branches skeletons once branches have loaded", () => {
      renderComponent({ branchesLoading: false });
      expect(screen.queryByTestId("skeleton-row-branches")).not.toBeInTheDocument();
      expect(screen.getByText("main")).toBeInTheDocument();
    });
  });
});
