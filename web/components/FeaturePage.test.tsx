import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { AgentStreamProvider } from "../hooks/useAgentStream.tsx";
import { SidebarProvider } from "./ui/sidebar.tsx";
import { FeaturePage } from "./FeaturePage.tsx";
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

// The header reuses SidebarTrigger (SettingsPage/ProjectDetail's pattern), which needs a
// SidebarProvider — and that provider's mobile-detection effect needs matchMedia, which jsdom
// doesn't implement. Stub it locally rather than pulling in a full sidebar test harness.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

function renderPage(overrides: Partial<Parameters<typeof FeaturePage>[0]> = {}) {
  const props = {
    project: "proj",
    featureId: "f1",
    onOpenTaskForce: vi.fn(),
    ...overrides,
  };
  render(
    <SidebarProvider>
      <AgentStreamProvider>
        <FeaturePage {...props} />
      </AgentStreamProvider>
    </SidebarProvider>,
  );
  return props;
}

describe("FeaturePage", () => {
  it("shows the feature name", () => {
    renderPage();
    expect(screen.getByText("Feature One")).toBeInTheDocument();
  });

  it("shows a Task forces metric with the count", () => {
    renderPage();
    const metric = screen.getByTestId("metric-task-forces");
    expect(metric).toHaveTextContent("Task forces");
    expect(metric).toHaveTextContent("2");
  });

  it("shows both task-force rows with name and branch", () => {
    renderPage();
    expect(screen.getByText("TF One")).toBeInTheDocument();
    expect(screen.getByText("feat/one")).toBeInTheDocument();
    expect(screen.getByText("TF Two")).toBeInTheDocument();
    expect(screen.getByText("feat/two")).toBeInTheDocument();
  });

  it("calls onOpenTaskForce with the feature id and task-force id when a row is clicked", async () => {
    const props = renderPage();
    await userEvent.click(screen.getByText("TF One"));
    expect(props.onOpenTaskForce).toHaveBeenCalledWith("f1", "t1");
  });

  it("shows a not-found state when the feature id doesn't match any feature", () => {
    renderPage({ featureId: "nope" });
    expect(screen.getByText(/feature not found/i)).toBeInTheDocument();
    expect(screen.queryByTestId("metric-task-forces")).not.toBeInTheDocument();
  });

  it("handles a null featureId gracefully", () => {
    renderPage({ featureId: null });
    expect(screen.getByText(/feature not found/i)).toBeInTheDocument();
  });
});
