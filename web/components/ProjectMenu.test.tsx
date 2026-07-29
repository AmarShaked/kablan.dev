import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { AgentStreamProvider } from "../hooks/useAgentStream.tsx";
import { ProjectMenu } from "./ProjectMenu.tsx";
import type { ProjectSummary } from "../api.ts";
import type { ProjectEntity } from "../lib/projectEntities.ts";

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

const feature: ProjectEntity = { kind: "feature", id: "f1", label: "Feature One", ts: 100, featureId: "f1" };
const worktree: ProjectEntity = {
  kind: "worktree",
  id: "/wt/one",
  label: "one",
  sublabel: "/wt/one",
  branch: "feat/one",
  ts: 100,
  worktreePath: "/wt/one",
};

function renderMenu(overrides: Partial<Parameters<typeof ProjectMenu>[0]> = {}) {
  const props = {
    projects,
    selected: "proj",
    onSelectProject: vi.fn(),
    servers: {},
    onRescan: vi.fn(),
    entities: { features: [feature], taskForces: [], branches: [], worktrees: [worktree] },
    unreadFor: vi.fn(() => 0),
    onOpenFeature: vi.fn(),
    onOpenTaskForce: vi.fn(),
    onOpenBranch: vi.fn(),
    onOpenWorktree: vi.fn(),
    onViewAll: vi.fn(),
    onFetch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(
    <AgentStreamProvider>
      <ProjectMenu {...props} />
    </AgentStreamProvider>,
  );
  return props;
}

describe("ProjectMenu", () => {
  it("renders the project switcher and the Features/Worktrees/Branches groups", () => {
    renderMenu();
    expect(screen.getByLabelText("Switch project")).toBeInTheDocument();
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Worktrees")).toBeInTheDocument();
    expect(screen.getByText("Branches")).toBeInTheDocument();
    expect(screen.getByText("Feature One")).toBeInTheDocument();
    expect(screen.getByText("one")).toBeInTheDocument();
  });

  it("fires onFetch when the Fetch action is clicked", async () => {
    const props = renderMenu();
    await userEvent.click(screen.getByLabelText(/fetch remote/i));
    expect(props.onFetch).toHaveBeenCalled();
  });
});
