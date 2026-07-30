import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentStreamProvider, useAgentStream } from "../hooks/useAgentStream.tsx";
import { Cockpit } from "./Cockpit.tsx";
import { api } from "../api.ts";
import type { Worktree, Branch, FactoryOverview } from "../api.ts";

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
      factory: {
        ...actual.api.factory,
        agentStart: vi.fn().mockResolvedValue({}),
        agentMessage: vi.fn().mockResolvedValue({ ok: true }),
        agentStop: vi.fn().mockResolvedValue({ ok: true }),
        getAgent: vi.fn().mockResolvedValue({ agent: null, events: [] }),
      },
    },
  };
});

let branchesData: Branch[] = [];
let worktreesData: Worktree[] = [];
let factoryData: FactoryOverview = { features: [], branchState: {} };

vi.mock("../queries.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../queries.ts")>();
  return {
    ...actual,
    useBranches: () => ({ data: branchesData, isPending: false }),
    useWorktrees: () => ({ data: worktreesData, isPending: false }),
    useFactory: () => ({ data: factoryData, isPending: false }),
    useCommits: () => ({ data: { timestamps: [] }, isPending: false }),
    useDiff: () => ({ data: { diff: "" }, isPending: false }),
    useGitlabOverview: () => ({ data: undefined, isPending: false }),
  };
});

function renderCockpit(project: string, branch: string) {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <AgentStreamProvider>
        <Cockpit project={project} branch={branch} onBack={() => {}} />
      </AgentStreamProvider>
    </QueryClientProvider>,
  );
}

const bareBranch: Branch = {
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

const filedWorktree: Worktree = {
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

/** Feeds messages into the AgentStreamProvider's ingest on mount. */
function Seed({ messages }: { messages: unknown[] }) {
  const { ingest } = useAgentStream();
  useEffect(() => {
    messages.forEach(ingest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const workingStatus = {
  type: "agent-status",
  key: "proj::branch:feat/one",
  agent: { key: "proj::branch:feat/one", status: "working", sessionId: null, pid: 123, startedAt: 0, exitCode: null },
};

describe("Cockpit", () => {
  it("shows the branch name in the header (no project prefix)", () => {
    branchesData = [bareBranch];
    worktreesData = [];
    factoryData = { features: [], branchState: {} };
    renderCockpit("proj", "feat/bare");
    expect(screen.getByText("feat/bare")).toBeInTheDocument();
    expect(screen.queryByText("proj")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to project/i })).toBeInTheDocument();
  });

  it("shows 'Start working' for a branch with no working copy, and calls agentStart + invalidates on click", async () => {
    branchesData = [bareBranch];
    worktreesData = [];
    factoryData = { features: [], branchState: {} };
    renderCockpit("proj", "feat/bare");

    expect(screen.getByText(/no working copy yet/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/message the agent/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /start working/i }));
    expect(api.factory.agentStart).toHaveBeenCalledWith("proj", "feat/bare", {
      copyNodeModules: true,
      copyEnv: true,
    });
  });

  it("passes copy opt-outs to agentStart when the Start-working checkboxes are unchecked", async () => {
    branchesData = [bareBranch];
    worktreesData = [];
    factoryData = { features: [], branchState: {} };
    renderCockpit("proj", "feat/bare");

    await userEvent.click(screen.getByRole("checkbox", { name: /copy node_modules/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /copy \.env/i }));
    await userEvent.click(screen.getByRole("button", { name: /start working/i }));
    expect(api.factory.agentStart).toHaveBeenCalledWith("proj", "feat/bare", {
      copyNodeModules: false,
      copyEnv: false,
    });
  });

  it("renders chat + details once a live worktree exists for the branch", async () => {
    branchesData = [{ ...bareBranch, name: "feat/one" }];
    worktreesData = [filedWorktree];
    factoryData = { features: [], branchState: {} };
    renderCockpit("proj", "feat/one");

    expect(screen.queryByText(/no working copy yet/i)).not.toBeInTheDocument();
    expect(await screen.findAllByText("feat/one")).not.toHaveLength(0);
    expect(screen.getByText("/wt/one")).toBeInTheDocument();
  });

  it("runs `npm install` in the worktree's cwd when Install deps is clicked", async () => {
    branchesData = [{ ...bareBranch, name: "feat/one" }];
    worktreesData = [filedWorktree];
    factoryData = { features: [], branchState: {} };
    renderCockpit("proj", "feat/one");

    await userEvent.click(screen.getByRole("button", { name: /install deps/i }));
    expect(api.startServer).toHaveBeenCalledWith(
      "proj",
      expect.objectContaining({ cwd: "/wt/one", command: "npm install" }),
    );
  });

  it("renders chat + details when only factory.branchState carries the worktree path (no live worktree yet)", () => {
    branchesData = [{ ...bareBranch, name: "feat/two" }];
    worktreesData = [];
    factoryData = { features: [], branchState: { "feat/two": { worktreePath: "/wt/two", createdAt: 1 } } };
    renderCockpit("proj", "feat/two");

    expect(screen.queryByText(/no working copy yet/i)).not.toBeInTheDocument();
    expect(screen.getByText("/wt/two")).toBeInTheDocument();
  });

  describe("agent wiring (migrated from the task-force cockpit)", () => {
    function renderWithSeed(seed: unknown[] = []) {
      branchesData = [{ ...bareBranch, name: "feat/one" }];
      worktreesData = [filedWorktree];
      factoryData = { features: [], branchState: {} };
      const qc = new QueryClient();
      render(
        <QueryClientProvider client={qc}>
          <AgentStreamProvider>
            <Seed messages={seed} />
            <Cockpit project="proj" branch="feat/one" onBack={() => {}} />
          </AgentStreamProvider>
        </QueryClientProvider>,
      );
    }

    it("renders the assistant text and the agent status", () => {
      const helloEvent = {
        type: "agent-event",
        key: "proj::branch:feat/one",
        event: { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hello" }] } },
      };
      renderWithSeed([workingStatus, helloEvent]);
      expect(screen.getByText("hello")).toBeInTheDocument();
      expect(screen.getByText("Working")).toBeInTheDocument();
    });

    it("auto-starts (factory.agentStart) then sends when the composer is used on a not-running agent", async () => {
      renderWithSeed([]); // no agent running yet
      const box = screen.getByPlaceholderText(/message the agent/i);
      await userEvent.type(box, "kick off");
      await userEvent.click(screen.getByRole("button", { name: /send/i }));
      await vi.waitFor(() => {
        expect(api.factory.agentStart).toHaveBeenCalledWith("proj", "feat/one");
        expect(api.factory.agentMessage).toHaveBeenCalledWith("proj", "feat/one", "kick off");
      });
    });

    it("calls factory.agentStop with (project, branch) when Stop is clicked", async () => {
      renderWithSeed([workingStatus]);
      await userEvent.click(screen.getByRole("button", { name: /^stop$/i }));
      expect(api.factory.agentStop).toHaveBeenCalledWith("proj", "feat/one");
    });

    it("sends the composer text via factory.agentMessage(project, branch, text)", async () => {
      renderWithSeed([workingStatus]);
      const box = screen.getByPlaceholderText(/message the agent/i);
      await userEvent.type(box, "do the thing");
      await userEvent.click(screen.getByRole("button", { name: /send/i }));
      expect(api.factory.agentMessage).toHaveBeenCalledWith("proj", "feat/one", "do the thing");
    });

    it("backfills via factory.getAgent(project, branch)", async () => {
      renderWithSeed([]);
      await waitFor(() => expect(api.factory.getAgent).toHaveBeenCalledWith("proj", "feat/one"));
    });
  });
});
