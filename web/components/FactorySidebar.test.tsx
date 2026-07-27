import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentStreamProvider, useAgentStream } from "../hooks/useAgentStream.tsx";
import { FactorySidebar } from "./FactorySidebar.tsx";
import type { Feature } from "../api.ts";

vi.mock("../api.ts");

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

/** Feeds messages into the AgentStreamProvider's ingest on mount, the way the app's
 * WebSocket handler normally would — lets a test seed unread counts without a real socket. */
function Seed({ messages }: { messages: unknown[] }) {
  const { ingest } = useAgentStream();
  useEffect(() => {
    messages.forEach(ingest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** A minimal agent-event targeting `key`, used only to bump the unread counter. */
function unreadEvent(key: string) {
  return {
    type: "agent-event",
    key,
    event: { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "x" }] } },
  };
}

function renderSidebar(overrides: Partial<Parameters<typeof FactorySidebar>[0]> = {}, seed: unknown[] = []) {
  const qc = new QueryClient();
  const props = {
    project: "proj",
    branchEntries,
    onBack: vi.fn(),
    onOpenFeature: vi.fn(),
    onOpenTaskForce: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider client={qc}>
      <AgentStreamProvider>
        <Seed messages={seed} />
        <FactorySidebar {...props} />
      </AgentStreamProvider>
    </QueryClientProvider>,
  );
  return props;
}

describe("FactorySidebar", () => {
  it("renders both feature names", () => {
    renderSidebar();
    expect(screen.getByText("Feature One")).toBeInTheDocument();
    expect(screen.getByText("Feature Two")).toBeInTheDocument();
  });

  it("shows task-force names under a feature once expanded via the chevron", async () => {
    renderSidebar();
    expect(screen.queryByText("TF One")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));
    expect(screen.getByText("TF One")).toBeInTheDocument();
    expect(screen.getByText("TF Two")).toBeInTheDocument();
  });

  it("clicking the chevron does not call onOpenFeature", async () => {
    const props = renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));
    expect(props.onOpenFeature).not.toHaveBeenCalled();
  });

  it("clicking the feature row body calls onOpenFeature without expanding it", async () => {
    const props = renderSidebar();
    await userEvent.click(screen.getByText("Feature One"));
    expect(props.onOpenFeature).toHaveBeenCalledWith("f1");
    expect(screen.queryByText("TF One")).not.toBeInTheDocument();
  });

  it("opens the create-feature dialog when New feature is clicked", async () => {
    renderSidebar();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /new feature/i }));
    expect(screen.getByRole("dialog", { name: /new feature/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  it("opens the create-task-force dialog for the right feature when New task force is clicked", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));
    await userEvent.click(screen.getByRole("button", { name: /new task force/i }));
    expect(screen.getByRole("dialog", { name: /new task force/i })).toBeInTheDocument();
  });

  it("calls onOpenTaskForce with the feature id and task-force id when a task force is clicked", async () => {
    const props = renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));
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

  it("shows an unread pill per task force and a summed pill on the feature row", async () => {
    // t1 gets 2 unread events, t2 gets 3 -> feature-level sum should be 5.
    renderSidebar({}, [
      unreadEvent("proj::t1"),
      unreadEvent("proj::t1"),
      unreadEvent("proj::t2"),
      unreadEvent("proj::t2"),
      unreadEvent("proj::t2"),
    ]);
    await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));

    expect(screen.getByTestId("unread-pill-t1")).toHaveTextContent("2");
    expect(screen.getByTestId("unread-pill-t2")).toHaveTextContent("3");
    expect(screen.getByTestId("unread-pill-feature-f1")).toHaveTextContent("5");
  });

  it("shows no unread pill when a task force or feature has zero unread", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: /expand feature one/i }));

    expect(screen.queryByTestId("unread-pill-t1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("unread-pill-t2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("unread-pill-feature-f1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("unread-pill-feature-f2")).not.toBeInTheDocument();
  });
});
