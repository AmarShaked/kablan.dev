import { useEffect } from "react";
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentStreamProvider, useAgentStream } from "../hooks/useAgentStream.tsx";
import { AgentChat } from "./AgentChat.tsx";
import { resetExpandStore } from "../lib/chatExpand.ts";

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

/** Renders a button that ingests the given frames when clicked — lets a test push a later status
 * frame (e.g. flip the agent from working → idle) after the initial mount-time seed. */
function LaterIngest({ messages, label }: { messages: unknown[]; label: string }) {
  const { ingest } = useAgentStream();
  return (
    <button type="button" onClick={() => messages.forEach(ingest)}>
      {label}
    </button>
  );
}

function renderChat(seed: unknown[] = [], overrides: Partial<Parameters<typeof AgentChat>[0]> = {}) {
  const onStart = vi.fn().mockResolvedValue(undefined);
  const onMessage = vi.fn().mockResolvedValue(undefined);
  const onStop = vi.fn().mockResolvedValue(undefined);
  const { unmount } = render(
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
  return { onStart, onMessage, onStop, unmount };
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
  // The expand/collapse store is a module-level singleton persisted to localStorage; reset it
  // between tests so open state from one test can't leak into another that reuses the same keys.
  beforeEach(() => resetExpandStore());

  it("sends the composer text via onMessage and optimistically shows a You bubble", async () => {
    // idle = running but not mid-turn → send immediately (submitting while "working" queues, tested below).
    const { onMessage } = renderChat([idleStatus]);
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
    const { onStart, onMessage } = renderChat([idleStatus]); // already running (idle, not mid-turn)
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "another");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith("another", []));
    expect(onStart).not.toHaveBeenCalled();
  });

  it("seeds the New-session first message as the opening You bubble", () => {
    renderChat([], { initialMessage: "kick things off" });
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("kick things off")).toBeInTheDocument();
  });

  it("renders New-session initialImages as thumbnails in the opening You bubble", () => {
    const urls = ["data:image/png;base64,AQIDBA==", "data:image/png;base64,BQYHCA=="];
    renderChat([], { initialMessage: "look at these", initialImages: urls });
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("look at these")).toBeInTheDocument();
    const thumbs = screen.getAllByAltText("pasted attachment");
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]).toHaveAttribute("src", urls[0]);
    expect(thumbs[1]).toHaveAttribute("src", urls[1]);
  });

  it("seeds an image-only opening You bubble even with no initial message", () => {
    renderChat([], { initialImages: ["data:image/png;base64,AQIDBA=="] });
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByAltText("pasted attachment")).toBeInTheDocument();
  });

  it("defaults the Permission picker to the configured default when it's a valid option", () => {
    renderChat([], { defaultPermissionMode: "bypassPermissions" });
    expect(screen.getByLabelText("Permission")).toHaveValue("bypassPermissions");
  });

  it("falls back to acceptEdits when the configured default isn't a per-session option", () => {
    renderChat([], { defaultPermissionMode: "auto" });
    expect(screen.getByLabelText("Permission")).toHaveValue("acceptEdits");
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
    const { onMessage } = renderChat([idleStatus]);
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

  it("shows the current tool label and a live elapsed timer while working", () => {
    vi.useFakeTimers();
    try {
      // Seed a working agent plus a tool call, so the row can surface the current activity.
      renderChat([
        workingStatus,
        ev({
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "tool_use", id: "b1", name: "Bash", input: { command: "npm test" } }],
          },
        }),
      ]);
      // The working row surfaces the most recent tool call's label as the current activity
      // (scoped to the row so it isn't confused with the transcript's own tool line).
      const row = screen.getByText("Claude Code").parentElement as HTMLElement;
      expect(within(row).getByText(/Bash npm test/)).toBeInTheDocument();
      // After a second passes the elapsed timer becomes live (m:ss).
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(within(row).getByText(/·\s*\d+:\d{2}/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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
    const { onMessage } = renderChat([idleStatus]);
    const box = screen.getByPlaceholderText(/message the agent/i);
    pasteImage(box);
    expect(await screen.findByAltText("pasted attachment")).toBeInTheDocument();

    await userEvent.type(box, "look at this");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onMessage).toHaveBeenCalledWith("look at this", [
      expect.objectContaining({ mediaType: "image/png", data: expect.any(String) }),
    ]);
  });

  function dropImage(target: HTMLElement, type = "image/png") {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "x.png", { type });
    fireEvent.drop(target, {
      dataTransfer: { types: ["Files"], files: [file], items: [{ kind: "file", type }] },
    });
  }

  it("stages a dropped image as an attachment and sends it as an image block", async () => {
    const { onMessage } = renderChat([idleStatus]);
    const box = screen.getByPlaceholderText(/message the agent/i);
    dropImage(box);
    expect(await screen.findByAltText("pasted attachment")).toBeInTheDocument();

    await userEvent.type(box, "see this");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onMessage).toHaveBeenCalledWith("see this", [
      expect.objectContaining({ mediaType: "image/png", data: expect.any(String) }),
    ]);
  });

  it("shows the drop overlay on dragover with files and hides it on dragleave", async () => {
    renderChat([workingStatus]);
    const box = screen.getByPlaceholderText(/message the agent/i);
    const dt = { types: ["Files"], files: [], items: [] };
    fireEvent.dragOver(box, { dataTransfer: dt });
    expect(await screen.findByText(/drop images to attach/i)).toBeInTheDocument();
    fireEvent.dragLeave(box, { dataTransfer: dt });
    expect(screen.queryByText(/drop images to attach/i)).not.toBeInTheDocument();
  });

  it("hides the drop overlay after a drop", async () => {
    renderChat([workingStatus]);
    const box = screen.getByPlaceholderText(/message the agent/i);
    fireEvent.dragOver(box, { dataTransfer: { types: ["Files"], files: [], items: [] } });
    expect(await screen.findByText(/drop images to attach/i)).toBeInTheDocument();
    dropImage(box);
    expect(screen.queryByText(/drop images to attach/i)).not.toBeInTheDocument();
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

  // ---- Phase 1: enriched transcript (markdown, todos, tool results, plan, MCP notice) ----

  const ev = (event: unknown) => ({ type: "agent-event", key: "proj::wt:/wt/one", event });
  const assistant = (content: unknown[]) => ev({ type: "assistant", message: { role: "assistant", content } });
  const toolResult = (id: string, content: unknown, isError = false) =>
    ev({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] } });

  it("renders assistant markdown: a ## heading becomes an <h2> and a fenced block renders code", () => {
    renderChat([assistant([{ type: "text", text: "## Big Heading\n\n```js\nconst answer = 42;\n```" }])]);
    expect(screen.getByRole("heading", { level: 2, name: /big heading/i })).toBeInTheDocument();
    // rehype-highlight tokenizes the fenced block — the `const` keyword becomes its own span.
    expect(screen.getByText("const")).toBeInTheDocument();
  });

  it("renders a TodoWrite tool_use as a checklist showing each item's text", () => {
    renderChat([
      assistant([
        {
          type: "tool_use",
          id: "td1",
          name: "TodoWrite",
          input: {
            todos: [
              { content: "First task", status: "completed" },
              { content: "Second task", status: "in_progress" },
            ],
          },
        },
      ]),
    ]);
    expect(screen.getByText("Todos")).toBeInTheDocument();
    expect(screen.getByText("First task")).toBeInTheDocument();
    expect(screen.getByText("Second task")).toBeInTheDocument();
  });

  it("shows a success dot for a completed tool call and reveals its result on click", async () => {
    renderChat([
      assistant([{ type: "tool_use", id: "r1", name: "Read", input: { file_path: "/a/x.ts" } }]),
      toolResult("r1", "file body here"),
    ]);
    expect(screen.getByTitle("success")).toBeInTheDocument();
    // Terse by default — the result is hidden until the line is expanded.
    expect(screen.queryByText("file body here")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Read x.ts"));
    expect(screen.getByText("file body here")).toBeInTheDocument();
  });

  it("shows a 'not available' notice for an errored mcp__ tool_result", async () => {
    renderChat([
      assistant([{ type: "tool_use", id: "m1", name: "mcp__claude_ai__search", input: {} }]),
      toolResult("m1", "server not connected", true),
    ]);
    expect(screen.getByTitle("error")).toBeInTheDocument();
    await userEvent.click(screen.getByText("mcp__claude_ai__search"));
    expect(screen.getByText(/isn't available in this agent/i)).toBeInTheDocument();
  });

  it("renders an ExitPlanMode tool_use as a Plan card with its markdown", () => {
    renderChat([
      assistant([{ type: "tool_use", id: "p1", name: "ExitPlanMode", input: { plan: "## My Plan\n\nStep one" } }]),
    ]);
    // Card title (a <div>) — disambiguated from the Permission dropdown's "Plan" <option>.
    expect(screen.getByText("Plan", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /my plan/i })).toBeInTheDocument();
  });

  // ---- Phase 2: diff rendering, thinking content, subagent cards, semantic aggregation ----

  it("renders an Edit tool_use as a diff header with a +/− stat and a revealable diff", async () => {
    renderChat([
      assistant([
        {
          type: "tool_use",
          id: "e1",
          name: "Edit",
          input: { file_path: "/a/foo.ts", old_string: "const a = 1;", new_string: "const b = 2;" },
        },
      ]),
    ]);
    // Header: basename + a +N stat; the diff body is collapsed until the header is clicked.
    expect(screen.getByText("foo.ts")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.queryByText("const b = 2;")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("foo.ts"));
    // Expanded: the removed old line and the added new line both show.
    expect(screen.getByText("const a = 1;")).toBeInTheDocument();
    expect(screen.getByText("const b = 2;")).toBeInTheDocument();
  });

  it("renders a Write tool_use as an all-additions diff", async () => {
    renderChat([
      assistant([
        {
          type: "tool_use",
          id: "w1",
          name: "Write",
          input: { file_path: "/a/new.ts", content: "line one\nline two" },
        },
      ]),
    ]);
    expect(screen.getByText("new.ts")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    await userEvent.click(screen.getByText("new.ts"));
    expect(screen.getByText("line one")).toBeInTheDocument();
    expect(screen.getByText("line two")).toBeInTheDocument();
  });

  it("renders a Task tool_use as a subagent card with the subagent_type and description", () => {
    renderChat([
      assistant([
        {
          type: "tool_use",
          id: "tk1",
          name: "Task",
          input: { subagent_type: "Explore", description: "find the bug", prompt: "go look" },
        },
      ]),
    ]);
    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByText("find the bug")).toBeInTheDocument();
  });

  it("collapses a run of consecutive Read tool_uses into a 'Read N files' header", () => {
    renderChat([
      assistant([
        { type: "tool_use", id: "rd1", name: "Read", input: { file_path: "/a/App.tsx" } },
        { type: "tool_use", id: "rd2", name: "Read", input: { file_path: "/a/api.ts" } },
        { type: "tool_use", id: "rd3", name: "Read", input: { file_path: "/a/z.ts" } },
      ]),
    ]);
    expect(screen.getByText("Read 3 files")).toBeInTheDocument();
    expect(screen.queryByText("3 tool calls")).not.toBeInTheDocument();
  });

  it("renders a thinking block that is collapsed by default and reveals its content on click", async () => {
    renderChat([assistant([{ type: "thinking", thinking: "I should look at the config first" }])]);
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.queryByText(/look at the config/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Thinking"));
    expect(screen.getByText(/look at the config/i)).toBeInTheDocument();
  });

  // ---- Phase 3: follow/jump scroll, token gauge, persisted expand/collapse ----

  it("shows a 'Jump to bottom' button once the transcript is scrolled up, and hides it on click", async () => {
    renderChat([assistant([{ type: "text", text: "hello there" }])]);
    const el = document.querySelector(".overflow-y-auto") as HTMLElement;
    expect(el).toBeTruthy();
    // jsdom does no layout, so stub the geometry to make the isAtBottom math see us scrolled up.
    Object.defineProperty(el, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: 300, configurable: true });
    el.scrollTop = 0;
    fireEvent.scroll(el);
    const jump = await screen.findByRole("button", { name: /jump to bottom/i });
    expect(jump).toBeInTheDocument();
    await userEvent.click(jump);
    expect(screen.queryByRole("button", { name: /jump to bottom/i })).not.toBeInTheDocument();
  });

  it("persists an expanded ToolGroup to localStorage and restores it on remount", async () => {
    localStorage.clear();
    const seed = [
      assistant([
        { type: "tool_use", id: "b1", name: "Bash", input: { command: "ls" } },
        { type: "tool_use", id: "b2", name: "Bash", input: { command: "pwd" } },
      ]),
    ];
    const { unmount } = renderChat(seed);
    // Collapsed by default: only the group header shows, the individual lines are hidden.
    const header = screen.getByText("Ran 2 commands");
    expect(screen.queryByText("Bash ls")).not.toBeInTheDocument();
    await userEvent.click(header);
    expect(screen.getByText("Bash ls")).toBeInTheDocument();
    // The open state was written to localStorage.
    const stored = JSON.parse(localStorage.getItem("kablan:chatExpand") || "{}") as Record<string, boolean>;
    expect(Object.values(stored)).toContain(true);
    // Remounting a fresh cockpit restores the expanded group from the persisted state.
    unmount();
    renderChat(seed);
    expect(screen.getByText("Bash ls")).toBeInTheDocument();
  });

  // ---- Message queueing: submit-while-working parks the message; it drains on next idle ----

  /** Like renderChat, but also mounts a "go idle" button that ingests an idle status frame — so a
   * test can flip the agent working → idle after enqueuing and observe the queue drain. */
  function renderQueueChat() {
    const onStart = vi.fn().mockResolvedValue(undefined);
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const onStop = vi.fn().mockResolvedValue(undefined);
    render(
      <AgentStreamProvider>
        <Seed messages={[workingStatus]} />
        <LaterIngest messages={[idleStatus]} label="go idle" />
        <AgentChat
          project="proj"
          agentKey="proj::wt:/wt/one"
          onStart={onStart}
          onMessage={onMessage}
          onStop={onStop}
        />
      </AgentStreamProvider>,
    );
    return { onStart, onMessage, onStop };
  }

  it("queues a message submitted while working instead of sending it, then drains it on idle", async () => {
    const { onMessage } = renderQueueChat();
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "queued work");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    // Not sent — parked as a chip; the composer is cleared for the next message.
    expect(onMessage).not.toHaveBeenCalled();
    expect(screen.getByText(/queued \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText("queued work")).toBeInTheDocument();
    expect(box).toHaveValue("");

    // Flip the agent to idle → the head drains and is delivered.
    await userEvent.click(screen.getByRole("button", { name: /go idle/i }));
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith("queued work", []));
    // Chip is gone once drained.
    expect(screen.queryByText(/queued \(1\)/i)).not.toBeInTheDocument();
  });

  it("cancels a queued message so it is never sent", async () => {
    const { onMessage } = renderQueueChat();
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "never mind");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(screen.getByText("never mind")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancel queued message/i }));
    expect(screen.queryByText("never mind")).not.toBeInTheDocument();

    // Even after going idle, the cancelled message is never delivered.
    await userEvent.click(screen.getByRole("button", { name: /go idle/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("sends immediately (does not queue) when the agent is not working", async () => {
    const { onMessage } = renderChat([idleStatus]); // idle, not working
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "go now");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith("go now", []));
    expect(screen.queryByText(/queued \(/i)).not.toBeInTheDocument();
  });

  // ---- Composer typeahead: @-file mentions + slash commands ----

  const mentionFiles = ["src/App.tsx", "api.ts", "README.md"];

  it("typing @ap opens a file dropdown filtered to matching paths", async () => {
    renderChat([idleStatus], { files: mentionFiles });
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "@ap");
    // "ap" matches src/App.tsx and api.ts, but not README.md.
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /src\/App\.tsx/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /api\.ts/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /README\.md/ })).not.toBeInTheDocument();
  });

  it("pressing Enter with the file dropdown open inserts the path and does NOT send", async () => {
    const { onMessage } = renderChat([idleStatus], { files: mentionFiles });
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "@ap");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    // The @query token is replaced by the top match's path + a trailing space, and nothing is sent.
    expect(box).toHaveValue("@src/App.tsx ");
    expect(onMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("typing / opens the slash menu and selecting /review fills the composer with its template", async () => {
    const { onMessage } = renderChat([idleStatus]);
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "/review");
    expect(await screen.findByRole("option", { name: /\/review/ })).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(box).toHaveValue("Review my current changes (git diff) and flag issues.");
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("Escape closes the file mention menu", async () => {
    renderChat([idleStatus], { files: mentionFiles });
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "@ap");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Escape closes the slash command menu", async () => {
    renderChat([idleStatus]);
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "/");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("a normal Enter still sends when no typeahead menu is open", async () => {
    const { onMessage } = renderChat([idleStatus], { files: mentionFiles });
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "just a message");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith("just a message", []));
  });

  // ---- Message EDIT / RETRY / RESET (fork the Claude session) ----

  // An assistant event carrying a uuid — the fork point derived for the NEXT user turn.
  const assistantWithUuid = (text: string, uuid: string) =>
    ev({ type: "assistant", uuid, message: { role: "assistant", content: [{ type: "text", text }] } });

  it("editing a You bubble forks at the preceding assistant uuid with the new text", async () => {
    const onEditMessage = vi.fn().mockResolvedValue(undefined);
    // Seed a completed turn (assistant with uuid A1), then send a user turn so a "You" bubble exists.
    renderChat([idleStatus, assistantWithUuid("first answer", "A1")], { onEditMessage });
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "original question");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(screen.getByText("original question")).toBeInTheDocument();

    // Open the inline editor (pencil), change the text, and Save & run.
    await userEvent.click(screen.getByRole("button", { name: /edit message/i }));
    const editor = screen.getByRole("textbox", { name: /edit message/i });
    await userEvent.clear(editor);
    await userEvent.type(editor, "edited question");
    await userEvent.click(screen.getByRole("button", { name: /save & run/i }));

    // Forks at A1 (the assistant uuid that preceded this user turn) with the edited text.
    expect(onEditMessage).toHaveBeenCalledWith("A1", "edited question", [], expect.any(Object));
  });

  it("editing drops the tail after the edited message but keeps prior context", async () => {
    // Full render with a LaterIngest button so we can push the reply to the edited turn AFTER it's
    // sent (it lands below the You bubble, i.e. the stale tail a fork discards).
    const onEditMessage = vi.fn().mockResolvedValue(undefined);
    render(
      <AgentStreamProvider>
        <Seed messages={[idleStatus, assistantWithUuid("first answer", "A1")]} />
        <LaterIngest messages={[assistantWithUuid("second answer", "A2")]} label="reply" />
        <AgentChat project="proj" agentKey="proj::wt:/wt/one" onStart={vi.fn().mockResolvedValue(undefined)} onMessage={vi.fn().mockResolvedValue(undefined)} onStop={vi.fn().mockResolvedValue(undefined)} onEditMessage={onEditMessage} />
      </AgentStreamProvider>,
    );
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "original question");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    // The reply to the sent turn arrives below the You bubble.
    await userEvent.click(screen.getByRole("button", { name: /^reply$/i }));
    expect(screen.getByText("second answer")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /edit message/i }));
    const editor = screen.getByRole("textbox", { name: /edit message/i });
    await userEvent.clear(editor);
    await userEvent.type(editor, "edited question");
    await userEvent.click(screen.getByRole("button", { name: /save & run/i }));

    // Edited text shows; the stale tail (its reply + old bubble) is dropped; prior-turn context stays.
    expect(screen.getByText("edited question")).toBeInTheDocument();
    expect(screen.queryByText("original question")).not.toBeInTheDocument();
    expect(screen.queryByText("second answer")).not.toBeInTheDocument();
    expect(screen.getByText("first answer")).toBeInTheDocument();
  });

  it("editing the first turn (no preceding assistant) forks fresh with a null uuid", async () => {
    const onEditMessage = vi.fn().mockResolvedValue(undefined);
    renderChat([idleStatus], { onEditMessage }); // no assistant seeded → no fork point
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "first ever");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await userEvent.click(screen.getByRole("button", { name: /edit message/i }));
    const editor = screen.getByRole("textbox", { name: /edit message/i });
    await userEvent.clear(editor);
    await userEvent.type(editor, "reworded");
    await userEvent.click(screen.getByRole("button", { name: /save & run/i }));

    expect(onEditMessage).toHaveBeenCalledWith(null, "reworded", [], expect.any(Object));
  });

  it("Retry re-runs the last user turn unchanged at its fork point", async () => {
    const onEditMessage = vi.fn().mockResolvedValue(undefined);
    renderChat([idleStatus, assistantWithUuid("answer", "A1")], { onEditMessage });
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "please retry me");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await userEvent.click(screen.getByRole("button", { name: /^retry$/i }));
    expect(onEditMessage).toHaveBeenCalledWith("A1", "please retry me", [], expect.any(Object));
  });

  it("Reset starts a fresh session and clears the transcript", async () => {
    const onReset = vi.fn().mockResolvedValue(undefined);
    renderChat([idleStatus, assistantWithUuid("some answer", "A1")], { onReset });
    expect(screen.getByText("some answer")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^reset$/i }));
    expect(onReset).toHaveBeenCalled();
    expect(screen.queryByText("some answer")).not.toBeInTheDocument();
  });

  it("shows no edit pencil when onEditMessage is not provided", async () => {
    renderChat([idleStatus]);
    const box = screen.getByPlaceholderText(/message the agent/i);
    await userEvent.type(box, "hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(screen.queryByRole("button", { name: /edit message/i })).not.toBeInTheDocument();
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
