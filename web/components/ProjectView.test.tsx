import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentStreamProvider } from "../hooks/useAgentStream.tsx";
import { ProjectView } from "./ProjectView.tsx";
import type { Feature, ProjectSummary } from "../api.ts";

vi.mock("../api.ts");

// ProjectView's Features browser needs the desktop app's factory backend (useFactory is
// isTauri-gated); force isTauri so these tests exercise it like the desktop app does.
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
    onOpenTaskForce: vi.fn(),
    ...overrides,
  };
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <AgentStreamProvider>
        <ProjectView {...props} />
      </AgentStreamProvider>
    </QueryClientProvider>,
  );
  return props;
}

describe("ProjectView", () => {
  it("shows the project name in the breadcrumb", () => {
    renderView();
    expect(screen.getByText("proj")).toBeInTheDocument();
  });

  it("shows both feature names", () => {
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

  it("force-expands the feature named by expandFeatureId", () => {
    renderView({ expandFeatureId: "f1" });
    expect(screen.getByText("TF One")).toBeInTheDocument();
  });

  it("re-expands a feature re-selected via expandNonce even after it was manually collapsed", async () => {
    const qc = new QueryClient();
    const tree = (nonce: number) => (
      <QueryClientProvider client={qc}>
        <AgentStreamProvider>
          <ProjectView project={project} onOpenTaskForce={vi.fn()} expandFeatureId="f1" expandNonce={nonce} />
        </AgentStreamProvider>
      </QueryClientProvider>
    );
    const { rerender } = render(tree(1));
    expect(screen.getByText("TF One")).toBeInTheDocument();

    // User manually collapses the feature.
    await userEvent.click(screen.getByRole("button", { name: /collapse feature one/i }));
    expect(screen.queryByText("TF One")).not.toBeInTheDocument();

    // Re-selecting the *same* feature from the sidebar/palette bumps the nonce — without it,
    // `expandFeatureId` is unchanged so the expand effect wouldn't re-fire and the feature would
    // stay collapsed.
    rerender(tree(2));
    expect(screen.getByText("TF One")).toBeInTheDocument();
  });

  it("opens the create-feature dialog when New feature is clicked", async () => {
    renderView();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /new feature/i }));
    expect(screen.getByRole("dialog", { name: /new feature/i })).toBeInTheDocument();
  });
});
