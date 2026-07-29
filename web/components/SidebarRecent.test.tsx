import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SidebarRecent } from "./SidebarRecent.tsx";
import type { BranchEntity, FeatureGroup } from "../lib/projectEntities.ts";

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

function renderComponent(overrides: Partial<Parameters<typeof SidebarRecent>[0]> = {}) {
  const props = {
    featureGroups: [] as FeatureGroup[],
    unfiled: [branchEntity()],
    onOpenBranch: vi.fn(),
    onFileBranch: vi.fn(),
    onUnfileBranch: vi.fn(),
    onNewFeature: vi.fn(),
    ...overrides,
  };
  render(<SidebarRecent {...props} />);
  return props;
}

describe("SidebarRecent", () => {
  it("renders the Features and Branches group labels", () => {
    renderComponent();
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Branches")).toBeInTheDocument();
    expect(screen.getByText("No features.")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("clicking an unfiled branch row calls onOpenBranch with its name", async () => {
    const props = renderComponent();
    await userEvent.click(screen.getByText("main"));
    expect(props.onOpenBranch).toHaveBeenCalledWith("main");
  });

  it("bolds the current branch's name", () => {
    renderComponent({ unfiled: [branchEntity({ name: "main", isCurrent: true })] });
    expect(screen.getByText("main")).toHaveClass("font-semibold");
  });

  it("shows a green dot for a branch with a running dev server", () => {
    renderComponent({ unfiled: [branchEntity({ name: "main", serverRunning: true })] });
    expect(screen.getByLabelText("Dev server running")).toBeInTheDocument();
  });

  it("does not show a server dot when the server isn't running", () => {
    renderComponent();
    expect(screen.queryByLabelText("Dev server running")).not.toBeInTheDocument();
  });

  it("shows a hollow 'Not started' dot for a branch with no working copy", () => {
    renderComponent({ unfiled: [branchEntity({ name: "main", hasWorktree: false })] });
    expect(screen.getByLabelText("Not started")).toBeInTheDocument();
  });

  it("shows a 'Working copy active' dot for a started branch", () => {
    renderComponent({ unfiled: [branchEntity({ name: "main", hasWorktree: true })] });
    expect(screen.getByLabelText("Working copy active")).toBeInTheDocument();
  });

  it("expanding a feature folder shows its member branches, and clicking one opens it", async () => {
    const featureGroups: FeatureGroup[] = [
      {
        feature: { id: "f1", name: "Feature One", branches: ["feat/one"] },
        branches: [branchEntity({ name: "feat/one" })],
      },
    ];
    const props = renderComponent({ featureGroups, unfiled: [] });
    expect(screen.queryByText("feat/one")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));
    expect(screen.getByText("feat/one")).toBeInTheDocument();

    await userEvent.click(screen.getByText("feat/one"));
    expect(props.onOpenBranch).toHaveBeenCalledWith("feat/one");
  });

  it("collapses a feature's branches when its header is clicked again", async () => {
    const featureGroups: FeatureGroup[] = [
      {
        feature: { id: "f1", name: "Feature One", branches: ["feat/one"] },
        branches: [branchEntity({ name: "feat/one" })],
      },
    ];
    renderComponent({ featureGroups, unfiled: [] });
    await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));
    expect(screen.getByText("feat/one")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /collapse feature one/i }));
    expect(screen.queryByText("feat/one")).not.toBeInTheDocument();
  });

  it("shows 'No branches yet.' when an expanded feature has none", async () => {
    const featureGroups: FeatureGroup[] = [
      { feature: { id: "f1", name: "Feature One", branches: [] }, branches: [] },
    ];
    renderComponent({ featureGroups, unfiled: [] });
    await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));
    expect(screen.getByText("No branches yet.")).toBeInTheDocument();
  });

  it('caps rendered branch rows at 10 in the Branches group', () => {
    const manyBranches = Array.from({ length: 15 }, (_, i) =>
      branchEntity({ name: `branch-${i}`, ts: 100 - i }),
    );
    renderComponent({ unfiled: manyBranches });
    for (let i = 0; i < 10; i++) expect(screen.getByText(`branch-${i}`)).toBeInTheDocument();
    for (let i = 10; i < 15; i++) expect(screen.queryByText(`branch-${i}`)).not.toBeInTheDocument();
  });

  it("does not render a Fetch button when onFetch is omitted", () => {
    renderComponent();
    expect(screen.queryByLabelText(/fetch remote/i)).not.toBeInTheDocument();
  });

  it("renders a Fetch button in the Branches group and fires onFetch when clicked", async () => {
    const onFetch = vi.fn().mockResolvedValue(undefined);
    renderComponent({ onFetch });
    await userEvent.click(screen.getByLabelText(/fetch remote/i));
    expect(onFetch).toHaveBeenCalled();
  });

  it("fires onNewFeature when the Features group's New feature action is clicked", async () => {
    const props = renderComponent();
    await userEvent.click(screen.getByLabelText(/new feature/i));
    expect(props.onNewFeature).toHaveBeenCalled();
  });

  describe("file/unfile affordance", () => {
    const features: FeatureGroup[] = [
      { feature: { id: "f1", name: "Feature One", branches: [] }, branches: [] },
      { feature: { id: "f2", name: "Feature Two", branches: [] }, branches: [] },
    ];

    it("hides the affordance for an unfiled branch when there are no features to file into", () => {
      renderComponent({ featureGroups: [] });
      expect(screen.queryByLabelText(/file main into a feature/i)).not.toBeInTheDocument();
    });

    it("lets an unfiled branch be filed into a feature", async () => {
      const props = renderComponent({ featureGroups: features });
      await userEvent.click(screen.getByLabelText(/file main into a feature/i));
      const menu = screen.getByRole("dialog");
      await userEvent.click(within(menu).getByText("Feature One"));
      expect(props.onFileBranch).toHaveBeenCalledWith("f1", "main");
    });

    it("lets a filed branch be removed from its feature", async () => {
      const filedGroups: FeatureGroup[] = [
        {
          feature: { id: "f1", name: "Feature One", branches: ["feat/one"] },
          branches: [branchEntity({ name: "feat/one", featureId: "f1" })],
        },
      ];
      const props = renderComponent({ featureGroups: filedGroups, unfiled: [] });
      await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));
      await userEvent.click(screen.getByLabelText(/remove feat\/one from its feature/i));
      await userEvent.click(screen.getByText("Remove from feature"));
      expect(props.onUnfileBranch).toHaveBeenCalledWith("f1", "feat/one");
    });
  });

  describe("loading skeletons", () => {
    it("shows 4 skeleton rows for Features while loading with none yet, and hides the empty state", () => {
      renderComponent({ featureGroups: [], featuresLoading: true });
      expect(screen.getAllByTestId("skeleton-row-features")).toHaveLength(4);
      expect(screen.queryByText("No features.")).not.toBeInTheDocument();
    });

    it("does not show Features skeletons once features have loaded", () => {
      renderComponent({ featuresLoading: false });
      expect(screen.queryByTestId("skeleton-row-features")).not.toBeInTheDocument();
    });

    it("shows 4 skeleton rows for Branches while loading with none yet, and hides the empty state", () => {
      renderComponent({ unfiled: [], branchesLoading: true });
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
