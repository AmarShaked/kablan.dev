import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Play, Square, Send, ChevronDown, ChevronRight } from "lucide-react";
import type { AgentStatus, AgentView } from "../api.ts";
import { useAgentStream } from "../hooks/useAgentStream.tsx";
import { AgentDot } from "./AgentDot.tsx";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseChoices } from "../lib/parseChoices.ts";

/** One entry in the chat's local timeline: either the user's own sent message (never echoed
 * back by the stream — it goes straight to stdin) or a raw agent stream-json event. */
type TimelineItem = { kind: "you"; text: string } | { kind: "agent"; event: unknown };

const STATUS_LABEL: Record<string, string> = {
  idle: "Ready",
  working: "Working",
  awaitingInput: "Awaiting input",
  done: "Done",
  failed: "Failed",
};

/** True while the agent process is alive and able to receive a message — including `idle`
 * (freshly started, no turn yet) so the composer stays enabled and the Stop button shows.
 * Only `working` drives the "thinking…" row. */
function isRunningStatus(status: AgentStatus | undefined): boolean {
  return status === "idle" || status === "working" || status === "awaitingInput";
}

/** Maps one raw stream-json event to a transcript row: assistant text -> a bubble, assistant
 * tool_use -> a compact "✎ name" line, user tool-result -> a compact bubble, result -> a turn
 * divider/summary, system spawn_error/stderr -> an error line, and everything else (stream_event,
 * other system subtypes) is noise and skipped. */
function renderEvent(ev: unknown, idx: number): ReactNode {
  if (!ev || typeof ev !== "object") return null;
  const e = ev as Record<string, any>;

  switch (e.type) {
    case "assistant": {
      const content = Array.isArray(e.message?.content) ? e.message.content : [];
      const parts: ReactNode[] = [];
      content.forEach((block: any, i: number) => {
        if (block?.type === "text" && block.text) {
          parts.push(
            <div
              key={`t-${i}`}
              className="max-w-[85%] self-start rounded-lg bg-accent/60 px-3 py-2 text-sm whitespace-pre-wrap"
            >
              {block.text}
            </div>,
          );
        } else if (block?.type === "tool_use") {
          parts.push(
            <div key={`u-${i}`} className="self-start px-1 font-mono text-xs text-muted-foreground">
              ✎ {block.name}
            </div>,
          );
        }
      });
      if (!parts.length) return null;
      return (
        <div key={idx} className="flex flex-col gap-1">
          {parts}
        </div>
      );
    }
    case "user": {
      const content = Array.isArray(e.message?.content) ? e.message.content : [];
      const results = content.filter((b: any) => b?.type === "tool_result");
      if (!results.length) return null;
      return (
        <div key={idx} className="flex flex-col gap-1">
          {results.map((r: any, i: number) => (
            <div
              key={i}
              className="max-w-[85%] self-start truncate rounded-lg bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground"
              title={typeof r.content === "string" ? r.content : JSON.stringify(r.content)}
            >
              {typeof r.content === "string" ? r.content : JSON.stringify(r.content)}
            </div>
          ))}
        </div>
      );
    }
    case "result": {
      const resultText =
        e.result === undefined || e.result === null
          ? ""
          : typeof e.result === "string"
            ? e.result
            : JSON.stringify(e.result);
      return (
        <div key={idx} className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>
            {e.subtype ?? "turn"}
            {resultText ? ` · ${resultText}` : ""}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
      );
    }
    case "system":
      if (e.subtype === "spawn_error" || e.subtype === "stderr") {
        return (
          <div
            key={idx}
            className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-500"
          >
            {e.message ?? e.text ?? "Agent error"}
          </div>
        );
      }
      return null; // init/hook/thinking_tokens/post_turn_summary — noise
    case "stream_event":
    default:
      return null;
  }
}

/** Extracts the text of the most recent `agent` timeline item that's an assistant text message,
 * so the Choose drawer can offer its options as chips. Returns null when there's no such message
 * yet (nothing to parse, or the agent's latest turn was tool-only). */
function lastAssistantText(timeline: TimelineItem[]): string | null {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const item = timeline[i];
    if (item.kind !== "agent") continue;
    const ev = item.event as Record<string, any> | null;
    if (!ev || typeof ev !== "object" || ev.type !== "assistant") continue;
    const content = Array.isArray(ev.message?.content) ? ev.message.content : [];
    const texts = content.filter((b: any) => b?.type === "text" && typeof b.text === "string");
    if (texts.length) return texts.map((b: any) => b.text).join("\n");
  }
  return null;
}

/** Small animated "thinking…" row shown at the end of the transcript while the agent is
 * working — a lightweight stand-in for the raw stream_event deltas we deliberately don't
 * re-enable. Uses Tailwind's motion-safe: variant so it's inert under prefers-reduced-motion. */
function ThinkingRow() {
  return (
    <div className="flex items-center gap-2 self-start px-1 py-1 text-xs text-muted-foreground">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[9px] font-semibold">
        CC
      </span>
      <span>Claude Code</span>
      <span className="flex items-center gap-0.5">
        <span className="size-1 rounded-full bg-muted-foreground motion-safe:animate-bounce [animation-delay:-300ms]" />
        <span className="size-1 rounded-full bg-muted-foreground motion-safe:animate-bounce [animation-delay:-150ms]" />
        <span className="size-1 rounded-full bg-muted-foreground motion-safe:animate-bounce" />
      </span>
      <span>thinking…</span>
    </div>
  );
}

/**
 * The cockpit's chat pane — drives a single branch's agent. The parent (`Cockpit`) owns the
 * actual API calls (so this component doesn't need to know about `api.factory.*` at all) and
 * supplies them as `onStart`/`onMessage`/`onStop`; it's keyed into `useAgentStream` via the
 * caller-supplied `agentKey` (`branchKey` from `../lib/agentKey.ts`).
 *
 * `onBackfill`, if supplied, is called once (when nothing has streamed in live yet) to seed the
 * transcript from the backend's persisted history — mirrors the original cockpit's behavior of
 * resolving `api.factory.getAgent(...)` on mount so a remounted/reopened cockpit isn't blank
 * until the next event arrives.
 *
 * When `canChat` is false (a bare branch with no worktree/agent yet), the composer and Start
 * button render disabled — the caller is expected to show its own call-to-action alongside.
 */
export function AgentChat({
  project: _project,
  agentKey,
  title,
  canChat = true,
  onStart,
  onMessage,
  onStop,
  onBackfill,
}: {
  project: string;
  agentKey: string;
  title?: string;
  canChat?: boolean;
  onStart: () => Promise<unknown>;
  onMessage: (text: string) => Promise<unknown>;
  onStop: () => Promise<unknown>;
  onBackfill?: () => Promise<{ agent: AgentView | null; events: unknown[] }>;
}) {
  const { agentFor, setActiveKey } = useAgentStream();
  const live = agentFor(agentKey);

  // Viewing this pane clears its unread and suppresses further increments while it's active;
  // leaving it (unmount — the cockpit remounts per target via its `key`) lets new events for it
  // accrue unread again.
  useEffect(() => {
    setActiveKey(agentKey);
    return () => setActiveKey(null);
  }, [agentKey, setActiveKey]);

  const [backfill, setBackfill] = useState<unknown[]>([]);
  const [backfillStatus, setBackfillStatus] = useState<AgentStatus | undefined>(undefined);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Backfill the transcript from the server once, if nothing has streamed in live yet.
  useEffect(() => {
    if (!onBackfill || live.events.length > 0) return;
    let cancelled = false;
    onBackfill()
      .then((res) => {
        if (cancelled) return;
        setBackfill(res.events ?? []);
        setBackfillStatus(res.agent?.status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentKey]);

  const events = useMemo(() => [...backfill, ...live.events], [backfill, live.events]);
  const status = live.status ?? backfillStatus;
  const running = isRunningStatus(status);

  // Local ordered timeline: interleaves the user's own sent messages (which never come back
  // as stream events — they go straight to stdin) with agent events, in send/arrival order.
  // Seeded from `events` on mount and grown as `events` grows (backfill resolving counts as
  // growth too), tracking how many have already been folded in via `processedRef`.
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const processedRef = useRef(0);
  useEffect(() => {
    if (events.length <= processedRef.current) return;
    const newItems: TimelineItem[] = events
      .slice(processedRef.current)
      .map((event) => ({ kind: "agent", event }));
    processedRef.current = events.length;
    setTimeline((prev) => [...prev, ...newItems]);
  }, [events]);

  const [drawerOpen, setDrawerOpen] = useState(true);
  const choices = useMemo(() => {
    const t = lastAssistantText(timeline);
    return t ? parseChoices(t) : [];
  }, [timeline]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [timeline.length, status]);

  const start = async () => {
    setBusy(true);
    try {
      await onStart();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try {
      await onStop();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };
  // Shared send path for both the free-text composer and Choose-drawer chips: append the
  // user's own "You" bubble to the timeline immediately (independent of whatever the agent
  // does next), then forward it to the agent. Returns whether the send succeeded.
  const sendText = async (value: string): Promise<boolean> => {
    const t = value.trim();
    if (!t) return false;
    setTimeline((prev) => [...prev, { kind: "you", text: t }]);
    setBusy(true);
    try {
      await onMessage(t);
      return true;
    } catch (err) {
      toast.error(String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    if (await sendText(text)) setText("");
  };
  const sendChoice = async (label: string) => {
    await sendText(label);
  };

  const chatEnabled = canChat && running;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <AgentDot status={status} />
        <span className="text-sm text-muted-foreground">
          {title ? `${title} · ` : ""}
          {STATUS_LABEL[status ?? "idle"] ?? "Idle"}
        </span>
        <div className="ml-auto flex gap-2">
          {running ? (
            <Button size="sm" variant="destructive" disabled={busy || !canChat} onClick={stop}>
              <Square className="size-3.5" /> Stop
            </Button>
          ) : (
            <Button size="sm" disabled={busy || !canChat} onClick={start}>
              <Play className="size-3.5" /> Start
            </Button>
          )}
        </div>
      </div>

      <div ref={transcriptRef} className="flex flex-1 flex-col gap-2 overflow-y-auto custom-scroll p-4">
        {timeline.length === 0 && status !== "working" ? (
          <p className="text-sm text-muted-foreground">
            {!canChat
              ? "Start a session to chat with an agent here."
              : running
                ? "Ready — send your first message to begin."
                : "Start the agent to begin."}
          </p>
        ) : (
          timeline.map((item, i) =>
            item.kind === "you" ? (
              <div key={`you-${i}`} className="flex flex-col items-end gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">You</span>
                <div className="max-w-[85%] self-end rounded-lg border border-border bg-card px-3 py-2 text-sm whitespace-pre-wrap">
                  {item.text}
                </div>
              </div>
            ) : (
              renderEvent(item.event, i)
            ),
          )
        )}
        {status === "working" && <ThinkingRow />}
      </div>

      {choices.length > 0 && (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setDrawerOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            {drawerOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            Choose · {choices.length} options
          </button>
          {drawerOpen && (
            <div className="flex flex-wrap gap-2 px-3 pb-3">
              {choices.map((choice, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={!chatEnabled || busy}
                  onClick={() => sendChoice(choice.label)}
                  className="rounded-full border border-border bg-accent/40 px-3 py-1.5 text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {choice.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 border-t border-border p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!chatEnabled}
          placeholder={
            !canChat ? "Start a session to chat" : running ? "Message the agent…" : "Start the agent to chat"
          }
          className="min-h-[40px] flex-1 resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button size="sm" disabled={!chatEnabled || busy || !text.trim()} onClick={send} aria-label="Send">
          <Send className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
