import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { AgentStreamProvider, useAgentStream } from "../hooks/useAgentStream.tsx";
import { AgentChat } from "./AgentChat.tsx";

/** Feeds messages into the AgentStreamProvider's ingest on mount, the way the app's WebSocket
 * handler normally would — lets a test seed the transcript without a real socket. */
function Seed({ messages }: { messages: unknown[] }) {
  const { ingest } = useAgentStream();
  useEffect(() => {
    messages.forEach(ingest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderChat(seed: unknown[] = [], overrides: Partial<Parameters<typeof AgentChat>[0]> = {}) {
  const onStart = vi.fn().mockResolvedValue(undefined);
  const onMessage = vi.fn().mockResolvedValue(undefined);
  const onStop = vi.fn().mockResolvedValue(undefined);
  render(
    <AgentStreamProvider>
      <Seed messages={seed} />
      <AgentChat
        project="proj"
        agentKey="proj::wt:/wt/one"
        onStart={onStart}
        onMessage={onMessage}
        onStop={onStop}
        {...overrides}
      />
    </AgentStreamProvider>,
  );
  return { onStart, onMessage, onStop };
}

const workingStatus = {
  type: "agent-status",
  key: "proj::wt:/wt/one",
  agent: { key: "proj::wt:/wt/one", status: "working", sessionId: null, pid: 1, startedAt: 0, exitCode: null },
};

const idleStatus = {
  type: "agent-status",
  key: "proj::wt:/wt/one",
  agent: { key: "proj::wt:/wt/one", status: "idle", sessionId: null, pid: 1, startedAt: 0, exitCode: null },
};

describe("AgentChat", () => {
  it("sends the composer text via onMessage and optimistically shows a You bubble", async () => {
    const { onMessage } = renderChat([workingStatus]);
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "do the thing");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(onMessage).toHaveBeenCalledWith("do the thing");
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("do the thing")).toBeInTheDocument();
  });

  it("shows a thinking indicator while the agent status is working", () => {
    renderChat([workingStatus]);
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });

  it("does not show a thinking indicator when the agent isn't working", () => {
    renderChat([]);
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
  });

  // Regression: a freshly-started agent (status "idle") must NOT look busy before the user
  // has sent anything — no "thinking…", but the composer is enabled and Stop is available.
  it("a freshly started (idle) agent is quiet but chattable", () => {
    renderChat([idleStatus]);
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/message the agent/i)).toBeEnabled();
    expect(screen.getByRole("button", { name: /^stop$/i })).toBeInTheDocument();
  });

  it("calls onStart when Start is clicked", async () => {
    const { onStart } = renderChat([]);
    await userEvent.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalled();
  });

  it("calls onStop when Stop is clicked", async () => {
    const { onStop } = renderChat([workingStatus]);
    await userEvent.click(screen.getByRole("button", { name: /^stop$/i }));
    expect(onStop).toHaveBeenCalled();
  });

  it("disables the composer and Start button when canChat is false", () => {
    renderChat([], { canChat: false });
    expect(screen.getByPlaceholderText(/start a session to chat/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /^start$/i })).toBeDisabled();
  });

  it("shows parsed choices as chips and sends the clicked chip via onMessage", async () => {
    const choiceEvent = {
      type: "agent-event",
      key: "proj::wt:/wt/one",
      event: {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "How should we proceed?\n1. Add tests\n2. Ship as-is" }],
        },
      },
    };
    const { onMessage } = renderChat([workingStatus, choiceEvent]);

    expect(screen.getByText(/choose/i)).toBeInTheDocument();
    const chip = screen.getByRole("button", { name: "Add tests" });
    await userEvent.click(chip);

    expect(onMessage).toHaveBeenCalledWith("Add tests");
  });

  it("seeds the transcript from onBackfill when nothing has streamed live yet", async () => {
    const onBackfill = vi.fn().mockResolvedValue({
      agent: { key: "proj::wt:/wt/one", status: "awaitingInput", sessionId: "s1", pid: 1, startedAt: 0, exitCode: null },
      events: [
        {
          type: "assistant",
          message: { role: "assistant", content: [{ type: "text", text: "backfilled hello" }] },
        },
      ],
    });
    renderChat([], { onBackfill });
    expect(await screen.findByText("backfilled hello")).toBeInTheDocument();
  });
});
