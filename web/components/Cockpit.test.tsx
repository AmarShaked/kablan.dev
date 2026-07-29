import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentStreamProvider, useAgentStream } from "../hooks/useAgentStream.tsx";
import { Cockpit, type CockpitTarget } from "./Cockpit.tsx";
import { api } from "../api.ts";
import type { Worktree, Branch, TaskForce } from "../api.ts";

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

const taskForce: TaskForce = {
  id: "t1",
  name: "TF One",
  branch: "feat/one",
  baseBranch: "main",
  worktreePath: "/wt/one",
  createdAt: 0,
};

/** Feeds messages into the AgentStreamProvider's ingest on mount, the way the app's
 * WebSocket handler normally would — lets a test seed the transcript without a real socket. */
function Seed({ messages }: { messages: unknown[] }) {
  const { ingest } = useAgentStream();
  useEffect(() => {
    messages.forEach(ingest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Exposes the live unread count for `tfKey` so tests can assert on setActiveKey/markRead
 * effects without reaching into the context's internals. */
function UnreadProbe({ tfKey }: { tfKey: string }) {
  const { unread } = useAgentStream();
  return <div data-testid="unread-probe">{unread(tfKey)}</div>;
}

const workingStatus = {
  type: "agent-status",
  key: "proj::t1",
  agent: { key: "proj::t1", status: "working", sessionId: null, pid: 123, startedAt: 0, exitCode: null },
};
const helloEvent = {
  type: "agent-event",
  key: "proj::t1",
  event: { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hello" }] } },
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

// Migrated from the now-deleted TaskForceCockpit.test.tsx (M1) — assertions not already covered
// by AgentChat.test.tsx (composer/thinking/chips/backfill, agent-key agnostic) or
// useAgentStream.test.tsx (unread/active-key mechanics in isolation): Cockpit's own
// taskForce-kind dispatch (agentStart/agentMessage/agentStop routed to the factory.* API),
// renderEvent's tool_use/spawn_error/malformed-event handling, the Choose-drawer's no-list
// case, the composer-reset-on-remount contract, and one end-to-end unread/active-key check.
describe("Cockpit (task-force agent wiring)", () => {
  function renderTaskForceCockpit(seed: unknown[] = [], tf: TaskForce = taskForce) {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <AgentStreamProvider>
          <Seed messages={seed} />
          <Cockpit project="proj" target={{ kind: "taskForce", taskForce: tf }} />
        </AgentStreamProvider>
      </QueryClientProvider>,
    );
  }

  it("renders the assistant text and the agent status", () => {
    renderTaskForceCockpit([workingStatus, helloEvent]);
    expect(screen.getByText("hello")).toBeInTheDocument();
    // Exact match — the details pane's "Working diff" card heading also matches /working/i.
    expect(screen.getByText("Working")).toBeInTheDocument();
  });

  it("calls factory.agentStart when Start is clicked", async () => {
    renderTaskForceCockpit([]);
    await userEvent.click(screen.getByRole("button", { name: /^start$/i }));
    expect(api.factory.agentStart).toHaveBeenCalledWith("proj", "t1");
  });

  it("calls factory.agentStop when Stop is clicked", async () => {
    renderTaskForceCockpit([workingStatus]);
    await userEvent.click(screen.getByRole("button", { name: /^stop$/i }));
    expect(api.factory.agentStop).toHaveBeenCalledWith("proj", "t1");
  });

  it("sends the composer text via factory.agentMessage and clears the field", async () => {
    renderTaskForceCockpit([workingStatus]);
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "do the thing");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(api.factory.agentMessage).toHaveBeenCalledWith("proj", "t1", "do the thing");
    expect(box).toHaveValue("");
  });

  it("renders a tool_use block as a compact line", () => {
    const toolEvent = {
      type: "agent-event",
      key: "proj::t1",
      event: {
        type: "assistant",
        message: { role: "assistant", content: [{ type: "tool_use", name: "Bash", id: "1", input: {} }] },
      },
    };
    renderTaskForceCockpit([workingStatus, toolEvent]);
    expect(screen.getByText(/✎ Bash/)).toBeInTheDocument();
  });

  it("shows a spawn_error system event as an error line", () => {
    const errEvent = {
      type: "agent-event",
      key: "proj::t1",
      event: { type: "system", subtype: "spawn_error", message: "boom" },
    };
    renderTaskForceCockpit([errEvent]);
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it("renders without throwing when an assistant event's message.content is missing or non-array", () => {
    const malformedEvents = [
      { type: "agent-event", key: "proj::t1", event: { type: "assistant", message: { role: "assistant" } } },
      {
        type: "agent-event",
        key: "proj::t1",
        event: { type: "assistant", message: { role: "assistant", content: "not an array" } },
      },
      {
        type: "agent-event",
        key: "proj::t1",
        event: { type: "user", message: { role: "user", content: { not: "an array" } } },
      },
    ];
    expect(() => renderTaskForceCockpit([workingStatus, ...malformedEvents])).not.toThrow();
    expect(screen.getByText("Working")).toBeInTheDocument();
  });

  it("doesn't show a Choose drawer when the last assistant message has no list", () => {
    renderTaskForceCockpit([workingStatus, helloEvent]);
    expect(screen.queryByText(/choose ·/i)).not.toBeInTheDocument();
  });

  it("clears the composer draft when remounted (via key change) for a different task force", async () => {
    const qc = new QueryClient();
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <AgentStreamProvider>
          <Seed messages={[workingStatus]} />
          <Cockpit key="proj::t1" project="proj" target={{ kind: "taskForce", taskForce }} />
        </AgentStreamProvider>
      </QueryClientProvider>,
    );

    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    await userEvent.type(box, "draft for t1");
    expect(box).toHaveValue("draft for t1");

    const otherTaskForce: TaskForce = { ...taskForce, id: "t2", name: "TF Two" };
    rerender(
      <QueryClientProvider client={qc}>
        <AgentStreamProvider>
          <Seed messages={[]} />
          <Cockpit key="proj::t2" project="proj" target={{ kind: "taskForce", taskForce: otherTaskForce }} />
        </AgentStreamProvider>
      </QueryClientProvider>,
    );

    const boxAfter = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(boxAfter).toHaveValue("");
  });

  it("marks its key read on mount, clearing unread accumulated before it was viewed", () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <AgentStreamProvider>
          <Seed messages={[helloEvent, helloEvent]} />
          <UnreadProbe tfKey="proj::t1" />
          <Cockpit project="proj" target={{ kind: "taskForce", taskForce }} />
        </AgentStreamProvider>
      </QueryClientProvider>,
    );

    // Seed ran before the cockpit's mount effect, so unread would have been 2 without
    // the cockpit's (AgentChat's) setActiveKey/markRead effect clearing it.
    expect(screen.getByTestId("unread-probe")).toHaveTextContent("0");
  });
});
