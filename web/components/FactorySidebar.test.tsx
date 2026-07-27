import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { AgentStreamProvider } from "../hooks/useAgentStream.tsx";
import { FactorySidebar } from "./FactorySidebar.tsx";
import type { Feature } from "../api.ts";

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

const branchEntries = [
  { id: "br:main", name: "main", kind: "branch" as const },
  { id: "wt:feature-x", name: "feature/x", kind: "worktree" as const },
];

function renderSidebar(overrides: Partial<Parameters<typeof FactorySidebar>[0]> = {}) {
  const props = {
    project: "proj",
    branchEntries,
    onBack: vi.fn(),
    onOpenFeature: vi.fn(),
    onOpenTaskForce: vi.fn(),
    onNewFeature: vi.fn(),
    ...overrides,
  };
  render(
    <AgentStreamProvider>
      <FactorySidebar {...props} />
    </AgentStreamProvider>,
  );
  return props;
}

describe("FactorySidebar", () => {
  it("renders both feature names", () => {
    renderSidebar();
    expect(screen.getByText("Feature One")).toBeInTheDocument();
    expect(screen.getByText("Feature Two")).toBeInTheDocument();
  });

  it("shows task-force names under a feature once expanded", async () => {
    renderSidebar();
    expect(screen.queryByText("TF One")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Feature One"));
    expect(screen.getByText("TF One")).toBeInTheDocument();
    expect(screen.getByText("TF Two")).toBeInTheDocument();
  });

  it("has a New feature control that calls onNewFeature", async () => {
    const props = renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: /new feature/i }));
    expect(props.onNewFeature).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenTaskForce with the feature id and task-force id when a task force is clicked", async () => {
    const props = renderSidebar();
    await userEvent.click(screen.getByText("Feature One"));
    await userEvent.click(screen.getByText("TF One"));
    expect(props.onOpenTaskForce).toHaveBeenCalledWith("f1", "t1");
  });

  it("calls onBack when the back button is clicked", async () => {
    const props = renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: /projects/i }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it("renders the branch entries", () => {
    renderSidebar();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("feature/x")).toBeInTheDocument();
  });
});
