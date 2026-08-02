import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentStreamProvider } from "../hooks/useAgentStream.tsx";
import { api } from "../api.ts";
import { ProjectMenu } from "./ProjectMenu.tsx";
import type { ProjectSummary } from "../api.ts";
import type { BranchEntity, FeatureGroup } from "../lib/projectEntities.ts";

vi.mock("../api.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api.ts")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      factory: {
        ...actual.api.factory,
        fileBranch: vi.fn().mockResolvedValue({ ok: true }),
        unfileBranch: vi.fn().mockResolvedValue({ ok: true }),
        reorderFeatureBranches: vi.fn().mockResolvedValue({ ok: true }),
        reorderFeatures: vi.fn().mockResolvedValue({ ok: true }),
      },
    },
  };
});

const projects: ProjectSummary[] = [
  {
    name: "proj",
    path: "/proj",
    currentBranch: "main",
    detectedCommand: null,
    devCommand: "",
    hasEnv: false,
    packageManager: "npm",
    lastCommitTs: null,
  },
];

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

function renderMenu(overrides: Partial<Parameters<typeof ProjectMenu>[0]> = {}) {
  const qc = new QueryClient();
  const props = {
    projects,
    selected: "proj",
    onSelectProject: vi.fn(),
    servers: {},
    onRescan: vi.fn(),
    featureGroups: [] as FeatureGroup[],
    unfiled: [branchEntity()],
    onOpenBranch: vi.fn(),
    onFetch: vi.fn().mockResolvedValue(undefined),
    onNewSession: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider client={qc}>
      <AgentStreamProvider>
        <ProjectMenu {...props} />
      </AgentStreamProvider>
    </QueryClientProvider>,
  );
  return props;
}

describe("ProjectMenu", () => {
  beforeEach(() => {
    vi.mocked(api.factory.fileBranch).mockClear();
    vi.mocked(api.factory.unfileBranch).mockClear();
  });

  it("renders the project switcher and the Features/Branches groups", () => {
    renderMenu();
    expect(screen.getByLabelText("Switch project")).toBeInTheDocument();
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Branches")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("calls onNewSession when the bottom 'New session' button is clicked", async () => {
    const props = renderMenu();
    await userEvent.click(screen.getByLabelText("New session"));
    expect(props.onNewSession).toHaveBeenCalled();
  });

  it("hides the New session '+' button when onNewSession is not provided", () => {
    renderMenu({ onNewSession: undefined });
    expect(screen.queryByLabelText("New session")).not.toBeInTheDocument();
  });

  it("fires onFetch when the Fetch action is clicked", async () => {
    const props = renderMenu();
    await userEvent.click(screen.getByLabelText(/fetch remote/i));
    expect(props.onFetch).toHaveBeenCalled();
  });

  it("passes featuresLoading/branchesLoading through to SidebarRecent's skeletons", () => {
    renderMenu({
      featureGroups: [],
      unfiled: [],
      featuresLoading: true,
      branchesLoading: true,
    });
    expect(screen.getAllByTestId("skeleton-row-features").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("skeleton-row-branches").length).toBeGreaterThan(0);
  });

  it("opens the create-feature dialog when the sidebar's New feature action is clicked", async () => {
    renderMenu();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/new feature/i));
    expect(screen.getByRole("dialog", { name: /new feature/i })).toBeInTheDocument();
  });

  it("files a branch into a feature via api.factory.fileBranch and invalidates the factory query", async () => {
    const featureGroups: FeatureGroup[] = [
      { feature: { id: "f1", name: "Feature One", branches: [] }, branches: [] },
    ];
    renderMenu({ featureGroups, unfiled: [branchEntity({ name: "main" })] });

    await userEvent.click(screen.getByLabelText(/file main into a feature/i));
    const menu = screen.getByRole("dialog");
    await userEvent.click(within(menu).getByText("Feature One"));

    expect(api.factory.fileBranch).toHaveBeenCalledWith("proj", "f1", "main");
  });

  describe("drag-and-drop reordering", () => {
    function fakeDataTransfer(): DataTransfer {
      const store = new Map<string, string>();
      return {
        setData: (format: string, data: string) => store.set(format, data),
        getData: (format: string) => store.get(format) ?? "",
      } as unknown as DataTransfer;
    }

    it("dragging a branch within a feature calls api.factory.reorderFeatureBranches with the new order", async () => {
      const featureGroups: FeatureGroup[] = [
        {
          feature: { id: "f1", name: "Feature One", branches: ["feat/a", "feat/b"] },
          branches: [
            branchEntity({ name: "feat/a", featureId: "f1" }),
            branchEntity({ name: "feat/b", featureId: "f1" }),
          ],
        },
      ];
      renderMenu({ featureGroups, unfiled: [] });
      await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));

      const transfer = fakeDataTransfer();
      fireEvent.dragStart(screen.getByText("feat/a"), { dataTransfer: transfer });
      // jsdom's real (unmocked) getBoundingClientRect is all-zero, so the drop always lands
      // on the "after" side of whatever row it's fired on — see SidebarRecent.test.tsx's
      // `fireDragAt` helper/doc comment for why a real DragEvent's clientY can't be simulated
      // via `fireEvent.dragOver`/`.drop` directly under jsdom.
      fireEvent.dragOver(screen.getByText("feat/b"), { dataTransfer: transfer });
      fireEvent.drop(screen.getByText("feat/b"), { dataTransfer: transfer });

      expect(api.factory.reorderFeatureBranches).toHaveBeenCalledWith("proj", "f1", ["feat/b", "feat/a"]);
    });

    it("dragging a feature folder onto another calls api.factory.reorderFeatures with the new order", async () => {
      const featureGroups: FeatureGroup[] = [
        { feature: { id: "f1", name: "Alpha", branches: [] }, branches: [] },
        { feature: { id: "f2", name: "Beta", branches: [] }, branches: [] },
      ];
      renderMenu({ featureGroups, unfiled: [] });

      const transfer = fakeDataTransfer();
      fireEvent.dragStart(screen.getByRole("button", { name: /expand alpha/i }), { dataTransfer: transfer });
      const betaHeader = screen.getByRole("button", { name: /expand beta/i });
      fireEvent.dragOver(betaHeader, { dataTransfer: transfer });
      fireEvent.drop(betaHeader, { dataTransfer: transfer });

      expect(api.factory.reorderFeatures).toHaveBeenCalledWith("proj", ["f2", "f1"]);
    });
  });
});
