import { render, screen, within } from "@testing-library/react";
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
});
