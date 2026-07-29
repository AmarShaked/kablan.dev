import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { HomeView } from "./HomeView.tsx";
import type { AgentStatus, RunningServer, LogLine } from "../api.ts";

const statuses: Record<string, AgentStatus> = {
  "proj-a::branch:feat/one": "working",
  "proj-b::branch:feature/nested/branch": "awaitingInput",
  "proj-a::branch:feat/idle": "idle",
  "proj-c::branch:feat/done": "done",
};

function makeServer(overrides: Partial<RunningServer> = {}): RunningServer {
  return {
    projectName: "proj-a",
    cwd: "/repos/proj-a",
    command: "npm run dev",
    branch: null,
    pid: 123,
    status: "running",
    startedAt: 0,
    exitCode: null,
    ...overrides,
  };
}

// Keyed by working-copy cwd, mirroring App's WS-fed `servers` state.
const servers: Record<string, RunningServer> = {
  "/repos/proj-a": makeServer({ projectName: "proj-a", cwd: "/repos/proj-a" }),
  "/repos/proj-b-worktrees/feature-x": makeServer({
    projectName: "proj-b",
    cwd: "/repos/proj-b-worktrees/feature-x",
    status: "stopped",
  }),
};

function renderView(overrides: Partial<Parameters<typeof HomeView>[0]> = {}) {
  const props = {
    statuses,
    servers,
    logs: {} as Record<string, LogLine[]>,
    onOpenBranch: vi.fn(),
    onOpenProject: vi.fn(),
    ...overrides,
  };
  render(<HomeView {...props} />);
  return props;
}

describe("HomeView", () => {
  it("renders a header", () => {
    renderView();
    expect(screen.getByText(/home/i)).toBeInTheDocument();
  });

  it("shows only working/awaitingInput agents, with counts", () => {
    renderView({ servers: {} });
    expect(screen.getByText(/agents working now/i)).toBeInTheDocument();
    expect(screen.getByText("proj-a")).toBeInTheDocument();
    expect(screen.getByText("feat/one")).toBeInTheDocument();
    expect(screen.getByText("proj-b")).toBeInTheDocument();
    expect(screen.getByText("feature/nested/branch")).toBeInTheDocument();
    // idle and done should not show up
    expect(screen.queryByText("feat/idle")).not.toBeInTheDocument();
    expect(screen.queryByText("feat/done")).not.toBeInTheDocument();
    // count reflects only the 2 active ones
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows an empty state when no agents are active", () => {
    renderView({ statuses: { "proj-a::branch:feat/idle": "idle" } });
    expect(screen.getByText(/nothing running/i)).toBeInTheDocument();
  });

  it("calls onOpenBranch with parsed project/branch when an agent row is clicked", async () => {
    const props = renderView();
    await userEvent.click(screen.getByText("feature/nested/branch"));
    expect(props.onOpenBranch).toHaveBeenCalledWith("proj-b", "feature/nested/branch");
  });

  it("shows only running dev servers, with counts", () => {
    renderView();
    expect(screen.getByText(/dev servers running now/i)).toBeInTheDocument();
    // proj-a's server is running -> shown; proj-b's is stopped -> not shown
    expect(screen.getByTestId("server-row-proj-a")).toBeInTheDocument();
    expect(screen.queryByTestId("server-row-proj-b")).not.toBeInTheDocument();
  });

  it("shows an empty state when no dev servers are running", () => {
    renderView({
      servers: {
        "/repos/proj-a": makeServer({ status: "stopped" }),
      },
    });
    expect(screen.getByText(/no dev servers running/i)).toBeInTheDocument();
  });

  it("calls onOpenProject when a server row is clicked", async () => {
    const props = renderView();
    const serverRow = screen.getByTestId("server-row-proj-a");
    await userEvent.click(serverRow);
    expect(props.onOpenProject).toHaveBeenCalledWith("proj-a");
  });

  it("shows a clickable URL when the server's logs contain one", () => {
    renderView({
      logs: {
        "/repos/proj-a": [{ ts: 0, stream: "stdout", text: "ready at http://localhost:5173" }],
      },
    });
    const link = screen.getByRole("link", { name: /localhost:5173/ });
    expect(link).toHaveAttribute("href", "http://localhost:5173");
  });
});
