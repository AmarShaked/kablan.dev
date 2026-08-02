import { useEffect } from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

    expect(onMessage).toHaveBeenCalledWith("do the thing", []);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("do the thing")).toBeInTheDocument();
  });

  it("auto-starts the agent on the first message when it isn't running", async () => {
    const { onStart, onMessage } = renderChat([]); // no status seed → agent not running
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "kick off");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    // waitFor polls inside act(), flushing the async start→send→setBusy(false) chain.
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith("kick off", []));
    expect(onStart).toHaveBeenCalled();
    expect(screen.getByText("kick off")).toBeInTheDocument();
  });

  it("does not re-start an already-running agent when sending", async () => {
    const { onStart, onMessage } = renderChat([workingStatus]); // already running
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "another");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith("another", []));
    expect(onStart).not.toHaveBeenCalled();
  });

  it("restarts a running agent with the chosen model when the Model dropdown changes", async () => {
    const { onStart } = renderChat([workingStatus]);
    await userEvent.selectOptions(screen.getByLabelText("Model"), "opus");
    await waitFor(() => expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ model: "opus" })));
  });

  it("restarts a running agent with the chosen permission mode when the Permission dropdown changes", async () => {
    const { onStart } = renderChat([workingStatus]);
    await userEvent.selectOptions(screen.getByLabelText("Permission"), "bypassPermissions");
    await waitFor(() =>
      expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ permissionMode: "bypassPermissions" })),
    );
  });

  it("appends the thinking keyword to the sent message but keeps the visible bubble clean", async () => {
    const { onMessage } = renderChat([workingStatus]);
    await userEvent.selectOptions(screen.getByLabelText("Thinking"), "hard");
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "do it");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onMessage).toHaveBeenCalledWith("do it\n\nthink hard", []);
    expect(screen.getByText("do it")).toBeInTheDocument(); // bubble shows what the user typed
  });

  it("shows a thinking indicator while the agent status is working", () => {
    renderChat([workingStatus]);
    expect(screen.getByText("thinking…")).toBeInTheDocument();
  });

  it("does not show a thinking indicator when the agent isn't working", () => {
    renderChat([]);
    expect(screen.queryByText("thinking…")).not.toBeInTheDocument();
  });

  // Regression: a freshly-started agent (status "idle") must NOT look busy before the user
  // has sent anything — no "thinking…", but the composer is enabled and Stop is available.
  it("a freshly started (idle) agent is quiet but chattable", () => {
    renderChat([idleStatus]);
    expect(screen.queryByText("thinking…")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/message the agent/i)).toBeEnabled();
    expect(screen.getByRole("button", { name: /^stop$/i })).toBeInTheDocument();
  });

  it("calls onStop when Stop is clicked", async () => {
    const { onStop } = renderChat([workingStatus]);
    await userEvent.click(screen.getByRole("button", { name: /^stop$/i }));
    expect(onStop).toHaveBeenCalled();
  });

  it("disables the composer when canChat is false", () => {
    renderChat([], { canChat: false });
    expect(screen.getByPlaceholderText(/start a session to chat/i)).toBeDisabled();
  });

  function pasteImage(box: HTMLElement, type = "image/png") {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "x.png", { type });
    fireEvent.paste(box, {
      clipboardData: { items: [{ kind: "file", type, getAsFile: () => file }] },
    });
  }

  it("attaches a pasted image and sends it as an image block alongside the text", async () => {
    const { onMessage } = renderChat([workingStatus]);
    const box = screen.getByPlaceholderText(/message the agent/i);
    pasteImage(box);
    expect(await screen.findByAltText("pasted attachment")).toBeInTheDocument();

    await userEvent.type(box, "look at this");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onMessage).toHaveBeenCalledWith("look at this", [
      expect.objectContaining({ mediaType: "image/png", data: expect.any(String) }),
    ]);
  });

  it("removes a staged image when its remove button is clicked", async () => {
    renderChat([workingStatus]);
    const box = screen.getByPlaceholderText(/message the agent/i);
    pasteImage(box);
    expect(await screen.findByAltText("pasted attachment")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /remove image/i }));
    expect(screen.queryByAltText("pasted attachment")).not.toBeInTheDocument();
  });

  const approvalFrame = {
    type: "agent-approval",
    key: "proj::wt:/wt/one",
    approval: { id: "appr-1", toolName: "Bash", input: { command: "rm -rf build" }, createdAt: 1 },
  };

  it("renders an Approve/Deny card for a pending approval and resolves on click", async () => {
    const onResolveApproval = vi.fn().mockResolvedValue(undefined);
    renderChat([workingStatus, approvalFrame], { onResolveApproval });
    // Tool name is shown prominently; both buttons render.
    expect(await screen.findByText("Bash")).toBeInTheDocument();
    const approve = screen.getByRole("button", { name: /^approve$/i });
    const deny = screen.getByRole("button", { name: /^deny$/i });
    expect(approve).toBeInTheDocument();
    expect(deny).toBeInTheDocument();

    await userEvent.click(approve);
    expect(onResolveApproval).toHaveBeenCalledWith("appr-1", "allow");
  });

  it("Deny resolves the approval with a deny decision", async () => {
    const onResolveApproval = vi.fn().mockResolvedValue(undefined);
    renderChat([workingStatus, approvalFrame], { onResolveApproval });
    await userEvent.click(await screen.findByRole("button", { name: /^deny$/i }));
    expect(onResolveApproval).toHaveBeenCalledWith("appr-1", "deny");
  });

  it("Permission dropdown includes a Supervised option", () => {
    renderChat([workingStatus]);
    expect(
      screen.getByRole("option", { name: "Supervised" }),
    ).toBeInTheDocument();
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
