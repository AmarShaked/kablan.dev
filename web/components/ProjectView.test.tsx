import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentStreamProvider } from "../hooks/useAgentStream.tsx";
import { SidebarProvider } from "./ui/sidebar.tsx";
import { ProjectView } from "./ProjectView.tsx";
import type { Feature, ProjectSummary } from "../api.ts";

vi.mock("../api.ts");

// ProjectView defaults to the Branches tab outside Tauri (no factory backend to show there);
// force isTauri so these tests can exercise the Features-tab-first default like the desktop app.
vi.mock("../lib/version.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/version.ts")>();
  return { ...actual, isTauri: true };
});

const features: Feature[] = [
  {
    id: "f1",
    name: "Feature One",
    taskForces: [
      { id: "t1", name: "TF One", branch: "feat/one", baseBranch: "main", worktreePath: "/wt/one", createdAt: 0 },
      { id: "t2", name: "TF Two", branch: "feat/two", baseBranch: "main", worktreePath: "/wt/two", createdAt: 0 },
    ],
  },
  { id: "f2", name: "Feature Two", taskForces: [] },
];

vi.mock("../queries.ts", () => ({
  useFactory: () => ({ data: { features, orphaned: [] }, isPending: false }),
  useBranches: () => ({ data: [], isPending: false }),
  useWorktrees: () => ({ data: [], isPending: false }),
  useGitlabOverview: () => ({ data: undefined, isPending: false }),
  useCommits: () => ({ data: [], isPending: false }),
  qk: { projects: ["projects"], branches: (n: string) => ["branches", n], worktrees: (n: string) => ["worktrees", n] },
}));

const project: ProjectSummary = {
  name: "proj",
  path: "/proj",
  currentBranch: "main",
  detectedCommand: null,
  devCommand: "",
  hasEnv: false,
  packageManager: "npm",
  lastCommitTs: null,
};

function renderView(overrides: Partial<Parameters<typeof ProjectView>[0]> = {}) {
  const props = {
    project,
    server: null,
    logs: [],
    onCommandChange: vi.fn(),
    linearWorkspace: "",
    onOpenTaskForce: vi.fn(),
    ...overrides,
  };
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <SidebarProvider>
        <AgentStreamProvider>
          <ProjectView {...props} />
        </AgentStreamProvider>
      </SidebarProvider>
    </QueryClientProvider>,
  );
  return props;
}

describe("ProjectView", () => {
  it("shows the project name in the breadcrumb", () => {
    renderView();
    expect(screen.getByText("proj")).toBeInTheDocument();
  });

  it("shows both feature names on the Features tab by default", () => {
    renderView();
    expect(screen.getByText("Feature One")).toBeInTheDocument();
    expect(screen.getByText("Feature Two")).toBeInTheDocument();
  });

  it("expanding a feature shows its task forces", async () => {
    renderView();
    expect(screen.queryByText("TF One")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));
    expect(screen.getByText("TF One")).toBeInTheDocument();
    expect(screen.getByText("TF Two")).toBeInTheDocument();
  });

  it("clicking a task force calls onOpenTaskForce with the feature id and task-force id", async () => {
    const props = renderView();
    await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));
    await userEvent.click(screen.getByText("TF One"));
    expect(props.onOpenTaskForce).toHaveBeenCalledWith("f1", "t1");
  });

  it("switching to the Branches tab renders the overview content", async () => {
    renderView();
    await userEvent.click(screen.getByRole("tab", { name: /branches/i }));
    // OverviewTab renders a "Search…" input as part of its filter bar.
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it("opens the create-feature dialog when New feature is clicked", async () => {
    renderView();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /new feature/i }));
    expect(screen.getByRole("dialog", { name: /new feature/i })).toBeInTheDocument();
  });
});
