import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentStreamProvider } from "../hooks/useAgentStream.tsx";
import { Cockpit, type CockpitTarget } from "./Cockpit.tsx";
import { api } from "../api.ts";
import type { Worktree, Branch } from "../api.ts";

vi.mock("../api.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api.ts")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getConfig: vi.fn().mockResolvedValue({ linearWorkspace: "" }),
      getServer: vi.fn().mockResolvedValue(null),
      getLogs: vi.fn().mockResolvedValue([]),
      startServer: vi.fn().mockResolvedValue(null),
      stopServer: vi.fn().mockResolvedValue({ stopped: true }),
      createWorktree: vi.fn().mockResolvedValue({
        path: "/wt/new",
        branch: "feat/new",
        head: "abc",
        bare: false,
        detached: false,
        locked: false,
        isMain: false,
        lastCommitTs: null,
        author: null,
        dirty: false,
      } satisfies Worktree),
      factory: {
        ...actual.api.factory,
        agentStart: vi.fn().mockResolvedValue({}),
        agentMessage: vi.fn().mockResolvedValue({ ok: true }),
        agentStop: vi.fn().mockResolvedValue({ ok: true }),
        getAgent: vi.fn().mockResolvedValue({ agent: null, events: [] }),
        worktreeAgentStart: vi.fn().mockResolvedValue({}),
        worktreeAgentMessage: vi.fn().mockResolvedValue({ ok: true }),
        worktreeAgentStop: vi.fn().mockResolvedValue({ ok: true }),
        getWorktreeAgent: vi.fn().mockResolvedValue({ agent: null, events: [] }),
      },
    },
  };
});

vi.mock("../queries.ts", () => ({
  useBranches: () => ({ data: [], isPending: false }),
  useCommits: () => ({ data: { timestamps: [] }, isPending: false }),
  useDiff: () => ({ data: { diff: "" }, isPending: false }),
  useGitlabOverview: () => ({ data: undefined, isPending: false }),
  useWorktrees: () => ({ data: [], isPending: false }),
}));

function renderCockpit(target: CockpitTarget, overrides: Partial<Parameters<typeof Cockpit>[0]> = {}) {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <AgentStreamProvider>
        <Cockpit project="proj" target={target} {...overrides} />
      </AgentStreamProvider>
    </QueryClientProvider>,
  );
}

const worktree: Worktree = {
  path: "/wt/one",
  branch: "feat/one",
  head: "abc123",
  bare: false,
  detached: false,
  locked: false,
  isMain: false,
  lastCommitTs: null,
  author: null,
  dirty: false,
};

const branch: Branch = {
  name: "feat/bare",
  current: false,
  upstream: null,
  lastCommit: null,
  lastCommitDate: null,
  lastCommitTs: null,
  author: null,
  ahead: 0,
  behind: 0,
  remoteOnly: false,
};

describe("Cockpit", () => {
  it("renders both the chat pane and the details pane for a worktree target", async () => {
    renderCockpit({ kind: "worktree", worktree });
    // Chat pane
    expect(screen.getByPlaceholderText(/start the agent to chat/i)).toBeInTheDocument();
    // Details pane (WorktreeDetails) — "feat/one" also appears in the breadcrumb, so scope
    // to elements with the details card's branch-name styling.
    expect(await screen.findAllByText("feat/one")).toHaveLength(2);
    expect(screen.getByText("/wt/one")).toBeInTheDocument();
  });

  it("shows 'Start a session' for a bare-branch target and calls createWorktree on click", async () => {
    renderCockpit({ kind: "branch", branch });
    expect(screen.getByPlaceholderText(/start a session to chat/i)).toBeDisabled();

    const button = screen.getByRole("button", { name: /start a session/i });
    await userEvent.click(button);

    expect(api.createWorktree).toHaveBeenCalledWith("proj", "feat/bare");
  });

  it("transitions to a worktree target and calls onStarted after 'Start a session' succeeds", async () => {
    const onStarted = vi.fn();
    renderCockpit({ kind: "branch", branch }, { onStarted });

    await userEvent.click(screen.getByRole("button", { name: /start a session/i }));

    expect(onStarted).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/wt/new", branch: "feat/new" }),
    );
    // After transitioning, the chat pane should now allow chatting (canChat=true for worktree).
    expect(await screen.findByPlaceholderText(/start the agent to chat/i)).toBeInTheDocument();
  });
});
