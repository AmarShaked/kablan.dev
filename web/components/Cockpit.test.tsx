import { useEffect } from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentStreamProvider, useAgentStream } from "../hooks/useAgentStream.tsx";
import { Cockpit } from "./Cockpit.tsx";
import { api } from "../api.ts";
import type { Worktree, Branch, FactoryOverview } from "../api.ts";

// `isTauri` gates the linear-workspace fetch and the GitLab-hosts query. jsdom is non-Tauri, so it
// reads false by default (matching the browser build); a getter lets a single test flip it on to
// exercise the Linear-configured path without disturbing the others.
const versionState = vi.hoisted(() => ({ isTauri: false }));
vi.mock("../lib/version.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/version.ts")>();
  return {
    ...actual,
    get isTauri() {
      return versionState.isTauri;
    },
  };
});

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
// App-wide configured GitLab hosts — the cheap signal driving Integrations-tab visibility. Default
// empty (GitLab not set up); a test sets a host to prove the tab appears from GitLab alone.
let gitlabHostsData: { hosts: string[] } | undefined = { hosts: [] };

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
    useGitlabHosts: () => ({ data: gitlabHostsData, isPending: false }),
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

// A running agent that is idle (not mid-turn): the composer sends immediately here, whereas
// submitting while "working" now parks the message in the client-side queue.
const idleStatus = {
  type: "agent-status",
  key: "proj::branch:feat/one",
  agent: { key: "proj::branch:feat/one", status: "idle", sessionId: null, pid: 123, startedAt: 0, exitCode: null },
};

afterEach(() => {
  // Reset the cross-test knobs so visibility state never bleeds between cases.
  versionState.isTauri = false;
  gitlabHostsData = { hosts: [] };
  (api.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ linearWorkspace: "" });
});

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

  it("hides the Integrations tab when neither Linear nor GitLab is configured", () => {
    branchesData = [{ ...bareBranch, name: "feat/one" }];
    worktreesData = [filedWorktree];
    factoryData = { features: [], branchState: {} };
    gitlabHostsData = { hosts: [] };
    renderCockpit("proj", "feat/one");
    expect(screen.queryByRole("tab", { name: /integrations/i })).not.toBeInTheDocument();
  });

  it("shows the Integrations tab when a GitLab host is configured (no Linear needed)", () => {
    branchesData = [{ ...bareBranch, name: "feat/one" }];
    worktreesData = [filedWorktree];
    factoryData = { features: [], branchState: {} };
    gitlabHostsData = { hosts: ["gitlab.com"] };
    renderCockpit("proj", "feat/one");
    expect(screen.getByRole("tab", { name: /integrations/i })).toBeInTheDocument();
  });

  it("shows the Integrations tab when a Linear workspace is configured (no GitLab host)", async () => {
    versionState.isTauri = true; // enables the linear-workspace config fetch
    (api.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ linearWorkspace: "acme" });
    branchesData = [{ ...bareBranch, name: "feat/one" }];
    worktreesData = [filedWorktree];
    factoryData = { features: [], branchState: {} };
    gitlabHostsData = { hosts: [] };
    renderCockpit("proj", "feat/one");
    expect(await screen.findByRole("tab", { name: /integrations/i })).toBeInTheDocument();
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

    it("sends straight to factory.agentMessage on a not-running agent — the server spawns the turn", async () => {
      vi.mocked(api.factory.agentStart).mockClear(); // the spy is shared across tests in this file
      renderWithSeed([]); // nothing running yet
      // Typing is driven via fireEvent.change: the composer lives inside a react-resizable-panels
      // panel, and userEvent.type's per-key path silently no-ops there under jsdom (real browsers
      // are unaffected). fireEvent.change fires the same onChange the component listens to.
      const box = screen.getByPlaceholderText(/message the agent/i);
      fireEvent.change(box, { target: { value: "kick off" } });
      await userEvent.click(screen.getByRole("button", { name: /send/i }));
      await vi.waitFor(() => {
        expect(api.factory.agentMessage).toHaveBeenCalledWith("proj", "feat/one", "kick off", [], { model: "", permissionMode: "acceptEdits" });
      });
      // Per-turn: the message endpoint launches the process, so the client must not start one
      // first — that would leave a process the message queues behind, with nothing to drain it.
      expect(api.factory.agentStart).not.toHaveBeenCalled();
    });

    it("calls factory.agentStop with (project, branch) when Stop is clicked", async () => {
      renderWithSeed([workingStatus]);
      await userEvent.click(screen.getByRole("button", { name: /^stop$/i }));
      expect(api.factory.agentStop).toHaveBeenCalledWith("proj", "feat/one");
    });

    it("sends the composer text via factory.agentMessage(project, branch, text)", async () => {
      renderWithSeed([idleStatus]);
      const box = screen.getByPlaceholderText(/message the agent/i);
      fireEvent.change(box, { target: { value: "do the thing" } }); // see auto-starts test re: fireEvent
      await userEvent.click(screen.getByRole("button", { name: /send/i }));
      await vi.waitFor(() =>
        expect(api.factory.agentMessage).toHaveBeenCalledWith("proj", "feat/one", "do the thing", [], {
          model: "",
          permissionMode: "acceptEdits",
        }),
      );
    });

    it("backfills via factory.getAgent(project, branch)", async () => {
      renderWithSeed([]);
      await waitFor(() => expect(api.factory.getAgent).toHaveBeenCalledWith("proj", "feat/one"));
    });
  });
});
