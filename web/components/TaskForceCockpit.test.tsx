import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentStreamProvider, useAgentStream } from "../hooks/useAgentStream.tsx";
import { SidebarProvider } from "./ui/sidebar.tsx";
import { TaskForceCockpit } from "./TaskForceCockpit.tsx";
import { api } from "../api.ts";
import type { TaskForce } from "../api.ts";

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

function renderCockpit(seed: unknown[] = [], tf: TaskForce = taskForce) {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <SidebarProvider>
        <AgentStreamProvider>
          <Seed messages={seed} />
          <TaskForceCockpit project="proj" taskForce={tf} />
        </AgentStreamProvider>
      </SidebarProvider>
    </QueryClientProvider>,
  );
}

const workingStatus = { type: "agent-status", key: "proj::t1", agent: { key: "proj::t1", status: "working", sessionId: null, pid: 123, startedAt: 0, exitCode: null } };
const helloEvent = {
  type: "agent-event",
  key: "proj::t1",
  event: { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hello" }] } },
};

describe("TaskForceCockpit", () => {
  it("renders the assistant text and the agent status", () => {
    renderCockpit([workingStatus, helloEvent]);
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText(/working/i)).toBeInTheDocument();
  });

  it("sends the composer text via agentMessage and clears the field", async () => {
    renderCockpit([workingStatus]);
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "do the thing");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(api.factory.agentMessage).toHaveBeenCalledWith("proj", "t1", "do the thing");
    expect(box).toHaveValue("");
  });

  it("calls agentStart when Start is clicked", async () => {
    renderCockpit([]);
    await userEvent.click(screen.getByRole("button", { name: /^start$/i }));
    expect(api.factory.agentStart).toHaveBeenCalledWith("proj", "t1");
  });

  it("calls agentStop when Stop is clicked", async () => {
    renderCockpit([workingStatus]);
    await userEvent.click(screen.getByRole("button", { name: /^stop$/i }));
    expect(api.factory.agentStop).toHaveBeenCalledWith("proj", "t1");
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
    renderCockpit([workingStatus, toolEvent]);
    expect(screen.getByText(/✎ Bash/)).toBeInTheDocument();
  });

  it("shows a spawn_error system event as an error line", () => {
    const errEvent = {
      type: "agent-event",
      key: "proj::t1",
      event: { type: "system", subtype: "spawn_error", message: "boom" },
    };
    renderCockpit([errEvent]);
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it("disables the composer when the agent isn't running", () => {
    renderCockpit([]);
    const box = screen.getByPlaceholderText(/start the agent to chat/i);
    expect(box).toBeDisabled();
  });

  it("renders without throwing when an assistant event's message.content is missing or non-array", () => {
    const malformedEvents = [
      {
        type: "agent-event",
        key: "proj::t1",
        event: { type: "assistant", message: { role: "assistant" } }, // no content at all
      },
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
    expect(() => renderCockpit([workingStatus, ...malformedEvents])).not.toThrow();
    // Status still renders fine even though the malformed events contribute no bubbles.
    expect(screen.getByText(/working/i)).toBeInTheDocument();
  });

  it("clears the composer draft when remounted (via key change) for a different task force", async () => {
    const qc = new QueryClient();
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <SidebarProvider>
          <AgentStreamProvider>
            <Seed messages={[workingStatus]} />
            <TaskForceCockpit key="proj::t1" project="proj" taskForce={taskForce} />
          </AgentStreamProvider>
        </SidebarProvider>
      </QueryClientProvider>,
    );

    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    await userEvent.type(box, "draft for t1");
    expect(box).toHaveValue("draft for t1");

    const otherTaskForce: TaskForce = { ...taskForce, id: "t2", name: "TF Two" };
    rerender(
      <QueryClientProvider client={qc}>
        <SidebarProvider>
          <AgentStreamProvider>
            <Seed messages={[]} />
            <TaskForceCockpit key="proj::t2" project="proj" taskForce={otherTaskForce} />
          </AgentStreamProvider>
        </SidebarProvider>
      </QueryClientProvider>,
    );

    const boxAfter = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(boxAfter).toHaveValue("");
  });

  it("marks its key read on mount, clearing unread accumulated before it was viewed", () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <SidebarProvider>
          <AgentStreamProvider>
            <Seed messages={[helloEvent, helloEvent]} />
            <UnreadProbe tfKey="proj::t1" />
            <TaskForceCockpit project="proj" taskForce={taskForce} />
          </AgentStreamProvider>
        </SidebarProvider>
      </QueryClientProvider>,
    );

    // Seed ran before the cockpit's mount effect, so unread would have been 2 without
    // the cockpit's setActiveKey/markRead effect clearing it.
    expect(screen.getByTestId("unread-probe")).toHaveTextContent("0");
  });

  it("keeps its key marked active while mounted, so new events for it don't bump unread", () => {
    const qc = new QueryClient();
    function Harness({ seed }: { seed: unknown[] }) {
      return (
        <QueryClientProvider client={qc}>
          <SidebarProvider>
            <AgentStreamProvider>
              {/* keyed by content so a new seed array remounts Seed and re-fires its ingest effect */}
              <Seed key={JSON.stringify(seed)} messages={seed} />
              <UnreadProbe tfKey="proj::t1" />
              <TaskForceCockpit project="proj" taskForce={taskForce} />
            </AgentStreamProvider>
          </SidebarProvider>
        </QueryClientProvider>
      );
    }
    const { rerender } = render(<Harness seed={[]} />);
    expect(screen.getByTestId("unread-probe")).toHaveTextContent("0");

    // A new event for the active key while the cockpit is mounted should not bump unread.
    rerender(<Harness seed={[helloEvent]} />);
    expect(screen.getByTestId("unread-probe")).toHaveTextContent("0");
  });

  it("clears the active key on unmount, so later events for it bump unread again", () => {
    const qc = new QueryClient();
    function Wrapper({ mounted, seed }: { mounted: boolean; seed: unknown[] }) {
      return (
        <QueryClientProvider client={qc}>
          <SidebarProvider>
            <AgentStreamProvider>
              <Seed key={JSON.stringify(seed)} messages={seed} />
              <UnreadProbe tfKey="proj::t1" />
              {mounted && <TaskForceCockpit project="proj" taskForce={taskForce} />}
            </AgentStreamProvider>
          </SidebarProvider>
        </QueryClientProvider>
      );
    }
    const { rerender } = render(<Wrapper mounted seed={[]} />);
    expect(screen.getByTestId("unread-probe")).toHaveTextContent("0");

    rerender(<Wrapper mounted={false} seed={[]} />);
    rerender(<Wrapper mounted={false} seed={[helloEvent]} />);
    expect(screen.getByTestId("unread-probe")).toHaveTextContent("1");
  });

  it("renders a right-aligned You bubble for a sent message, interleaved with agent events", async () => {
    renderCockpit([workingStatus, helloEvent]);
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "please continue");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("please continue")).toBeInTheDocument();
    // The prior agent bubble is still there too.
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("shows a thinking indicator while the agent status is working", () => {
    renderCockpit([workingStatus]);
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });

  it("does not show a thinking indicator when the agent isn't working", () => {
    renderCockpit([]);
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
  });

  it("shows parsed choices as chips and sends the clicked chip via agentMessage", async () => {
    const choiceEvent = {
      type: "agent-event",
      key: "proj::t1",
      event: {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "How should we proceed?\n1. Add tests\n2. Ship as-is" },
          ],
        },
      },
    };
    renderCockpit([workingStatus, choiceEvent]);

    expect(screen.getByText(/choose/i)).toBeInTheDocument();
    expect(screen.getByText(/2 options/i)).toBeInTheDocument();
    const chip = screen.getByRole("button", { name: "Add tests" });
    await userEvent.click(chip);

    expect(api.factory.agentMessage).toHaveBeenCalledWith("proj", "t1", "Add tests");
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("doesn't show a Choose drawer when the last assistant message has no list", () => {
    renderCockpit([workingStatus, helloEvent]);
    expect(screen.queryByText(/choose ·/i)).not.toBeInTheDocument();
  });
});
