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
});
