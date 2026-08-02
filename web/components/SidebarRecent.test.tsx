import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SidebarRecent } from "./SidebarRecent.tsx";
import type { BranchEntity, FeatureGroup } from "../lib/projectEntities.ts";

/** Minimal stand-in for the browser's `DataTransfer`, matching what `fireEvent.dragStart` /
 * `dragOver` / `drop` accept — jsdom has no native drag-and-drop implementation, so tests
 * supply this fake object themselves rather than relying on a real drag gesture. */
function fakeDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    setData: (format: string, data: string) => store.set(format, data),
    getData: (format: string) => store.get(format) ?? "",
  } as unknown as DataTransfer;
}

/** A row's DOMRect for deterministic dropSide("before" | "after") math in tests — jsdom's real
 * getBoundingClientRect always reports zeros (no layout engine), so top/bottom-half hover tests
 * mock it explicitly. */
const ROW_RECT: DOMRect = {
  top: 100,
  height: 20,
  bottom: 120,
  left: 0,
  right: 100,
  width: 100,
  x: 0,
  y: 100,
  toJSON: () => ({}),
};

/**
 * Fires a "dragover"/"drop" with a real `clientY` — jsdom has no `DragEvent` global, so
 * `@testing-library`'s `fireEvent.dragOver`/`.drop` fall back to a plain `Event`, which
 * (per `@testing-library/dom`'s `createEvent`) only special-cases `dataTransfer`/`clipboardData`
 * onto the event object; any other init property (like `clientY`) is silently dropped. Building
 * a `MouseEvent` ourselves (jsdom supports that one fully, `clientY` included) and manually
 * attaching `dataTransfer` sidesteps the gap — this is the standard workaround for testing
 * position-aware HTML5 drag-and-drop under jsdom.
 */
function fireDragAt(type: "dragover" | "drop", node: Element, dataTransfer: DataTransfer, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  fireEvent(node, event);
}

function branchEntity(overrides: Partial<BranchEntity> = {}): BranchEntity {
  const name = overrides.name ?? "main";
  return {
    name,
    displayName: overrides.title ?? name,
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
    onRenameBranch: vi.fn(),
    onReorderFeatureBranches: vi.fn(),
    onReorderFeatures: vi.fn(),
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

  it("marks the active branch's row as current (aria-current)", () => {
    renderComponent({ unfiled: [branchEntity({ name: "main" })], activeBranch: "main" });
    expect(screen.getByRole("button", { name: /main/i })).toHaveAttribute("aria-current", "true");
  });

  it("does not mark rows as current when no branch is active", () => {
    renderComponent({ unfiled: [branchEntity({ name: "main" })], activeBranch: null });
    expect(screen.getByRole("button", { name: /main/i })).not.toHaveAttribute("aria-current");
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

  it("shows an 'Active session' dot on a feature folder with a live member session", () => {
    const featureGroups: FeatureGroup[] = [
      {
        feature: { id: "f1", name: "Feature One", branches: ["feat/one"] },
        branches: [branchEntity({ name: "feat/one", agentStatus: "working" })],
        hasActiveSession: true,
      },
    ];
    renderComponent({ featureGroups, unfiled: [] });
    expect(screen.getByLabelText("Active session")).toBeInTheDocument();
  });

  it("does not show an 'Active session' dot when no member has a live session", () => {
    const featureGroups: FeatureGroup[] = [
      {
        feature: { id: "f1", name: "Feature One", branches: ["feat/one"] },
        branches: [branchEntity({ name: "feat/one" })],
        hasActiveSession: false,
      },
    ];
    renderComponent({ featureGroups, unfiled: [] });
    expect(screen.queryByLabelText("Active session")).not.toBeInTheDocument();
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

  describe("display title (rename)", () => {
    it("shows a branch's display title as the primary label, with the git branch name as a secondary line", () => {
      renderComponent({
        unfiled: [branchEntity({ name: "feat/xyz-123", title: "Nice Feature" })],
      });
      expect(screen.getByText("Nice Feature")).toBeInTheDocument();
      // The raw git branch name is still shown (secondary line) so it stays discoverable.
      expect(screen.getByText("feat/xyz-123")).toBeInTheDocument();
    });

    it("renaming a branch commits the new title via onRenameBranch on Enter", async () => {
      const props = renderComponent({ unfiled: [branchEntity({ name: "main" })] });
      await userEvent.click(screen.getByLabelText(/branch options/i));
      await userEvent.click(screen.getByText("Rename"));
      const input = screen.getByLabelText(/rename main/i);
      await userEvent.clear(input);
      await userEvent.type(input, "My Title");
      fireEvent.keyDown(input, { key: "Enter" });
      expect(props.onRenameBranch).toHaveBeenCalledWith("main", "My Title");
    });

    it("clearing the title (empty value) calls onRenameBranch with an empty string", async () => {
      const props = renderComponent({ unfiled: [branchEntity({ name: "main", title: "Old Title" })] });
      // A titled branch is filed-or-not; here unfiled with no features => "Options for main".
      await userEvent.click(screen.getByLabelText(/branch options/i));
      await userEvent.click(screen.getByText("Rename"));
      const input = screen.getByLabelText(/rename main/i);
      await userEvent.clear(input);
      fireEvent.keyDown(input, { key: "Enter" });
      expect(props.onRenameBranch).toHaveBeenCalledWith("main", "");
    });

    it("Escape cancels a rename without calling onRenameBranch", async () => {
      const props = renderComponent({ unfiled: [branchEntity({ name: "main" })] });
      await userEvent.click(screen.getByLabelText(/branch options/i));
      await userEvent.click(screen.getByText("Rename"));
      const input = screen.getByLabelText(/rename main/i);
      await userEvent.type(input, "Discarded");
      fireEvent.keyDown(input, { key: "Escape" });
      expect(props.onRenameBranch).not.toHaveBeenCalled();
    });
  });

  describe("drag and drop", () => {
    it("dragging an unfiled branch onto a Feature folder files it there", () => {
      const featureGroups: FeatureGroup[] = [
        { feature: { id: "f1", name: "Feature One", branches: [] }, branches: [] },
      ];
      const props = renderComponent({ featureGroups, unfiled: [branchEntity({ name: "main" })] });

      const transfer = fakeDataTransfer();
      fireEvent.dragStart(screen.getByText("main"), { dataTransfer: transfer });
      const header = screen.getByRole("button", { name: /expand feature one/i });
      fireEvent.dragOver(header, { dataTransfer: transfer });
      fireEvent.drop(header, { dataTransfer: transfer });

      expect(props.onFileBranch).toHaveBeenCalledWith("f1", "main");
      expect(props.onReorderFeatureBranches).not.toHaveBeenCalled();
    });

    it("dragging a filed branch onto the Branches group unfiles it", async () => {
      const featureGroups: FeatureGroup[] = [
        {
          feature: { id: "f1", name: "Feature One", branches: ["feat/one"] },
          branches: [branchEntity({ name: "feat/one", featureId: "f1" })],
        },
      ];
      const props = renderComponent({ featureGroups, unfiled: [] });
      await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));

      const transfer = fakeDataTransfer();
      fireEvent.dragStart(screen.getByText("feat/one"), { dataTransfer: transfer });
      const branchesLabel = screen.getByText("Branches");
      fireEvent.dragOver(branchesLabel, { dataTransfer: transfer });
      fireEvent.drop(branchesLabel, { dataTransfer: transfer });

      expect(props.onUnfileBranch).toHaveBeenCalledWith("f1", "feat/one");
    });

    it("dragging an unfiled branch onto the Branches group is a no-op (nothing to unfile)", () => {
      const props = renderComponent({ unfiled: [branchEntity({ name: "main" })] });
      const transfer = fakeDataTransfer();
      fireEvent.dragStart(screen.getByText("main"), { dataTransfer: transfer });
      const branchesLabel = screen.getByText("Branches");
      fireEvent.dragOver(branchesLabel, { dataTransfer: transfer });
      fireEvent.drop(branchesLabel, { dataTransfer: transfer });
      expect(props.onUnfileBranch).not.toHaveBeenCalled();
    });

    it("dropping a branch on the top half of a sibling row within the same feature reorders before it", async () => {
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(ROW_RECT);
      const featureGroups: FeatureGroup[] = [
        {
          feature: { id: "f1", name: "Feature One", branches: ["feat/a", "feat/b", "feat/c"] },
          branches: [
            branchEntity({ name: "feat/a", featureId: "f1" }),
            branchEntity({ name: "feat/b", featureId: "f1" }),
            branchEntity({ name: "feat/c", featureId: "f1" }),
          ],
        },
      ];
      const props = renderComponent({ featureGroups, unfiled: [] });
      await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));

      const transfer = fakeDataTransfer();
      fireEvent.dragStart(screen.getByText("feat/a"), { dataTransfer: transfer });
      // top half of the row (rect top=100, height=20) => insert BEFORE feat/c
      fireDragAt("dragover", screen.getByText("feat/c"), transfer, 105);
      fireDragAt("drop", screen.getByText("feat/c"), transfer, 105);

      expect(props.onReorderFeatureBranches).toHaveBeenCalledWith("f1", ["feat/b", "feat/a", "feat/c"]);
      expect(props.onFileBranch).not.toHaveBeenCalled();
    });

    it("dropping a branch on the bottom half of a sibling row inserts after it", async () => {
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(ROW_RECT);
      const featureGroups: FeatureGroup[] = [
        {
          feature: { id: "f1", name: "Feature One", branches: ["feat/a", "feat/b", "feat/c"] },
          branches: [
            branchEntity({ name: "feat/a", featureId: "f1" }),
            branchEntity({ name: "feat/b", featureId: "f1" }),
            branchEntity({ name: "feat/c", featureId: "f1" }),
          ],
        },
      ];
      const props = renderComponent({ featureGroups, unfiled: [] });
      await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));

      const transfer = fakeDataTransfer();
      fireEvent.dragStart(screen.getByText("feat/a"), { dataTransfer: transfer });
      // bottom half of the row => insert AFTER feat/c
      fireDragAt("dragover", screen.getByText("feat/c"), transfer, 115);
      fireDragAt("drop", screen.getByText("feat/c"), transfer, 115);

      expect(props.onReorderFeatureBranches).toHaveBeenCalledWith("f1", ["feat/b", "feat/c", "feat/a"]);
    });

    it("dragging a branch from one feature onto a different feature files it there (not a reorder)", async () => {
      const featureGroups: FeatureGroup[] = [
        {
          feature: { id: "f1", name: "Feature One", branches: ["feat/a"] },
          branches: [branchEntity({ name: "feat/a", featureId: "f1" })],
        },
        { feature: { id: "f2", name: "Feature Two", branches: [] }, branches: [] },
      ];
      const props = renderComponent({ featureGroups, unfiled: [] });
      await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));

      const transfer = fakeDataTransfer();
      fireEvent.dragStart(screen.getByText("feat/a"), { dataTransfer: transfer });
      const f2Header = screen.getByRole("button", { name: /expand feature two/i });
      fireEvent.dragOver(f2Header, { dataTransfer: transfer });
      fireEvent.drop(f2Header, { dataTransfer: transfer });

      expect(props.onFileBranch).toHaveBeenCalledWith("f2", "feat/a");
      expect(props.onReorderFeatureBranches).not.toHaveBeenCalled();
    });

    it("dropping a branch back onto its own feature's header is a no-op", async () => {
      const featureGroups: FeatureGroup[] = [
        {
          feature: { id: "f1", name: "Feature One", branches: ["feat/a"] },
          branches: [branchEntity({ name: "feat/a", featureId: "f1" })],
        },
      ];
      const props = renderComponent({ featureGroups, unfiled: [] });
      await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));

      const transfer = fakeDataTransfer();
      fireEvent.dragStart(screen.getByText("feat/a"), { dataTransfer: transfer });
      // the header now reads "Collapse Feature One" (already expanded above)
      const header = screen.getByRole("button", { name: /collapse feature one/i });
      fireEvent.dragOver(header, { dataTransfer: transfer });
      fireEvent.drop(header, { dataTransfer: transfer });

      expect(props.onFileBranch).not.toHaveBeenCalled();
      expect(props.onReorderFeatureBranches).not.toHaveBeenCalled();
    });

    it("dragging a Feature folder header onto another reorders the features", () => {
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(ROW_RECT);
      const featureGroups: FeatureGroup[] = [
        { feature: { id: "f1", name: "Alpha", branches: [] }, branches: [] },
        { feature: { id: "f2", name: "Beta", branches: [] }, branches: [] },
        { feature: { id: "f3", name: "Gamma", branches: [] }, branches: [] },
      ];
      const props = renderComponent({ featureGroups, unfiled: [] });

      const transfer = fakeDataTransfer();
      fireEvent.dragStart(screen.getByRole("button", { name: /expand alpha/i }), { dataTransfer: transfer });
      const gammaHeader = screen.getByRole("button", { name: /expand gamma/i });
      // top half => insert BEFORE gamma
      fireDragAt("dragover", gammaHeader, transfer, 105);
      fireDragAt("drop", gammaHeader, transfer, 105);

      expect(props.onReorderFeatures).toHaveBeenCalledWith(["f2", "f1", "f3"]);
      expect(props.onFileBranch).not.toHaveBeenCalled();
    });

    it("dragging a branch does not fire onReorderFeatures, and dragging a feature does not fire onFileBranch/onUnfileBranch", () => {
      // A feature-folder drag and a branch drag use different DataTransfer MIME types, so
      // dropping one kind of payload never triggers the other kind's callback.
      const featureGroups: FeatureGroup[] = [
        { feature: { id: "f1", name: "Alpha", branches: [] }, branches: [] },
        { feature: { id: "f2", name: "Beta", branches: [] }, branches: [] },
      ];
      const props = renderComponent({ featureGroups, unfiled: [] });

      const transfer = fakeDataTransfer();
      fireEvent.dragStart(screen.getByRole("button", { name: /expand alpha/i }), { dataTransfer: transfer });
      const betaHeader = screen.getByRole("button", { name: /expand beta/i });
      fireEvent.dragOver(betaHeader, { dataTransfer: transfer });
      fireEvent.drop(betaHeader, { dataTransfer: transfer });

      expect(props.onFileBranch).not.toHaveBeenCalled();
      expect(props.onUnfileBranch).not.toHaveBeenCalled();
      expect(props.onReorderFeatures).toHaveBeenCalled();
    });
  });

  describe("floating drag ghost", () => {
    it("shows a floating chip with the branch name once dragging starts and the cursor moves, and hides it on dragEnd", () => {
      renderComponent({ unfiled: [branchEntity({ name: "main" })] });

      // fakeDataTransfer has no setDragImage — the component must guard around calling it.
      const transfer = fakeDataTransfer();
      const row = screen.getByText("main");
      expect(() => fireEvent.dragStart(row, { dataTransfer: transfer })).not.toThrow();

      // The ghost mounts on dragStart (positioned off-screen until the first cursor move, so it's
      // effectively invisible) and shows what's being dragged; a move repositions it via a ref
      // (requestAnimationFrame, no re-render) — it must not throw.
      const chip = screen.getByTestId("drag-ghost");
      expect(within(chip).getByText("main")).toBeInTheDocument();
      expect(() =>
        fireEvent(document, new MouseEvent("dragover", { bubbles: true, clientX: 42, clientY: 24 })),
      ).not.toThrow();

      fireEvent.dragEnd(row, { dataTransfer: transfer });
      expect(screen.queryByTestId("drag-ghost")).not.toBeInTheDocument();
    });

    it("shows a floating chip with the feature name for a feature-folder drag", () => {
      const featureGroups: FeatureGroup[] = [
        { feature: { id: "f1", name: "Feature One", branches: [] }, branches: [] },
      ];
      renderComponent({ featureGroups, unfiled: [] });

      const transfer = fakeDataTransfer();
      const header = screen.getByRole("button", { name: /expand feature one/i });
      expect(() => fireEvent.dragStart(header, { dataTransfer: transfer })).not.toThrow();

      fireEvent(document, new MouseEvent("dragover", { bubbles: true, clientX: 10, clientY: 10 }));

      expect(within(screen.getByTestId("drag-ghost")).getByText("Feature One")).toBeInTheDocument();
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
