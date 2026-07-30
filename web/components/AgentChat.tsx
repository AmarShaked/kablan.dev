import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Square, Send, ChevronDown, ChevronRight } from "lucide-react";
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

/** A terse one-line label for a tool call — the tool name plus its most telling argument (a file
 * basename, a truncated command, a search pattern) so the transcript reads like Claude Code's
 * compact tool lines rather than dumping full inputs. */
function toolSummary(name: string, input: unknown): string {
  const inp = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const base = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
  const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);
  switch (name) {
    case "Read":
    case "Write":
    case "Edit":
    case "NotebookEdit":
      return inp.file_path ? `${name} ${base(String(inp.file_path))}` : name;
    case "Bash":
      return inp.command ? `Bash ${clip(String(inp.command).replace(/\s+/g, " "))}` : "Bash";
    case "Grep":
      return inp.pattern ? `Grep ${clip(String(inp.pattern), 40)}` : "Grep";
    case "Glob":
      return inp.pattern ? `Glob ${clip(String(inp.pattern), 40)}` : "Glob";
    case "Task":
      return inp.description ? `Task ${clip(String(inp.description), 50)}` : "Task";
    default:
      return name;
  }
}

/** Renders a small subset of inline markdown as React nodes: `**bold**` → semibold, and
 * `` `code` `` → a mono chip. Everything else is plain text (JSX-escaped). Used so option labels
 * like "**Metronome** — …" read as formatted text instead of printing literal asterisks. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(
        <strong key={k++} className="font-semibold text-foreground">
          {m[1]}
        </strong>,
      );
    } else {
      nodes.push(
        <code key={k++} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {m[2]}
        </code>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Splits an option label into a bold title + a description, so the picker can render each choice
 * as a title/description card (like the question dialog). Prefers a leading `**bold**` as the
 * title; otherwise splits on the first em/en dash; otherwise the whole label is the title. */
function splitChoice(label: string): { title: string; desc: string } {
  const bold = /^\s*\*\*(.+?)\*\*\s*(?:[—–-]\s*)?(.*)$/.exec(label);
  if (bold) return { title: bold[1].trim(), desc: bold[2].trim() };
  const dash = /^(.+?)\s+[—–]\s+(.+)$/.exec(label);
  if (dash) return { title: dash[1].trim(), desc: dash[2].trim() };
  return { title: label.trim(), desc: "" };
}

/** A single flattened transcript row, after unpacking each stream event into its display pieces.
 * The renderer coalesces consecutive `tool` prims into one collapsible group; everything else
 * renders inline. Tool *results* (the raw `user` events) never become prims — they're the bulk of
 * the noise, and the `tool` line already says what ran. */
type Prim =
  | { t: "you"; key: string; text: string }
  | { t: "text"; key: string; text: string }
  | { t: "tool"; key: string; label: string }
  | { t: "result"; key: string; label: string }
  | { t: "error"; key: string; text: string };

/** Unpacks the ordered timeline into a flat list of display prims — one `you` bubble per sent
 * message, and per agent event its assistant text bubbles + tool lines (a result → a divider, a
 * spawn_error/stderr → an error line). Everything else (init/hook/stream_event, tool results) is
 * dropped as noise. */
function flattenTimeline(timeline: TimelineItem[]): Prim[] {
  const out: Prim[] = [];
  timeline.forEach((item, i) => {
    if (item.kind === "you") {
      out.push({ t: "you", key: `you-${i}`, text: item.text });
      return;
    }
    const e = item.event as Record<string, any> | null;
    if (!e || typeof e !== "object") return;
    switch (e.type) {
      case "assistant": {
        const content = Array.isArray(e.message?.content) ? e.message.content : [];
        content.forEach((block: any, b: number) => {
          if (block?.type === "text" && block.text) {
            out.push({ t: "text", key: `t-${i}-${b}`, text: block.text });
          } else if (block?.type === "tool_use") {
            out.push({ t: "tool", key: `u-${i}-${b}`, label: toolSummary(block.name, block.input) });
          }
        });
        break;
      }
      case "result": {
        // A turn-end marker only. Claude Code's `result.result` field repeats the ENTIRE final
        // assistant text, which we already rendered as streamed `text` bubbles — so we show just
        // the outcome (subtype) as a slim divider and deliberately drop `result` to avoid
        // reprinting the whole message.
        out.push({ t: "result", key: `r-${i}`, label: String(e.subtype ?? "done") });
        break;
      }
      case "system":
        if (e.subtype === "spawn_error" || e.subtype === "stderr") {
          out.push({ t: "error", key: `s-${i}`, text: e.message ?? e.text ?? "Agent error" });
        }
        break;
      // "user" (tool results), "stream_event", other system subtypes → noise, skipped.
    }
  });
  return out;
}

/** One compact "⏺ Read file.ts" tool line. */
function ToolLine({ label }: { label: string }) {
  return (
    <div className="flex max-w-full items-center gap-1.5 font-mono text-xs text-muted-foreground">
      <span className="shrink-0 text-primary">⏺</span>
      <span className="truncate">{label}</span>
    </div>
  );
}

/** A run of ≥2 consecutive tool calls, collapsed into one row ("N tool calls") that expands to
 * reveal the individual `⏺` lines under a hairline rail. Always starts collapsed — the count is
 * usually all you want; expand to inspect what the agent touched. */
function ToolGroup({ tools }: { tools: Array<{ key: string; label: string }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex max-w-full flex-col self-start">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start rounded px-1 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 opacity-70" />
        ) : (
          <ChevronRight className="size-3 shrink-0 opacity-70" />
        )}
        <span className="shrink-0 text-primary">⏺</span>
        <span className="font-medium text-foreground">{tools.length} tool calls</span>
      </button>
      {open && (
        <div className="mt-1 ml-[9px] flex flex-col gap-0.5 border-l border-border pl-3">
          {tools.map((t) => (
            <ToolLine key={t.key} label={t.label} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Renders the flattened prims, coalescing runs of ≥2 consecutive tool calls into one
 * collapsible `ToolGroup`; a lone tool call stays a plain inline line. */
function renderPrims(prims: Prim[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  let run: Array<{ key: string; label: string }> = [];
  const flush = () => {
    if (run.length === 0) return;
    const group = run;
    run = [];
    if (group.length === 1) {
      nodes.push(<ToolLine key={group[0].key} label={group[0].label} />);
    } else {
      nodes.push(<ToolGroup key={`g-${group[0].key}`} tools={group} />);
    }
  };
  for (const p of prims) {
    if (p.t === "tool") {
      run.push({ key: p.key, label: p.label });
      continue;
    }
    flush();
    switch (p.t) {
      case "you":
        nodes.push(
          <div key={p.key} className="flex flex-col items-end gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">You</span>
            <div className="max-w-[85%] self-end rounded-lg border border-border bg-card px-3 py-2 text-sm whitespace-pre-wrap">
              {p.text}
            </div>
          </div>,
        );
        break;
      case "text":
        nodes.push(
          <div
            key={p.key}
            className="max-w-[85%] self-start rounded-lg bg-accent/60 px-3 py-2 text-sm whitespace-pre-wrap"
          >
            {renderInline(p.text)}
          </div>,
        );
        break;
      case "result":
        nodes.push(
          <div key={p.key} className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>{p.label}</span>
            <span className="h-px flex-1 bg-border" />
          </div>,
        );
        break;
      case "error":
        nodes.push(
          <div
            key={p.key}
            className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-500"
          >
            {p.text}
          </div>,
        );
        break;
    }
  }
  flush();
  return nodes;
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
  // Re-open the picker whenever a *new* set of options arrives, so a manual dismiss (✕) only
  // hides the current set — the next question's options aren't suppressed by it.
  const choicesSig = choices.map((c) => c.label).join(" ");
  useEffect(() => {
    if (choicesSig) setDrawerOpen(true);
  }, [choicesSig]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [timeline.length, status]);

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
      // Auto-start the agent on the first message so the user can just type — no explicit Start
      // click. `running` is false until an agent process is alive for this branch; onStart()
      // resolves once the process is spawned (stdin ready), then we deliver the message.
      if (!running) await onStart();
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

  // Composer is enabled whenever the branch can host an agent — the first message auto-starts it
  // (see sendText), so we don't require a running process up front.
  const chatEnabled = canChat;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={transcriptRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto custom-scroll p-4">
        {timeline.length === 0 && status !== "working" ? (
          <p className="text-sm text-muted-foreground">
            {!canChat
              ? "Start a session to chat with an agent here."
              : "Send a message to begin — the agent starts on your first message."}
          </p>
        ) : (
          renderPrims(flattenTimeline(timeline))
        )}
        {status === "working" && <ThinkingRow />}
      </div>

      {choices.length > 0 && !drawerOpen && (
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Show options"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="size-3.5" />
            {choices.length} option{choices.length === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {choices.length > 0 && drawerOpen && (
        <div className="border-t border-border p-3 pb-0">
          <div className="mb-2 flex items-center gap-2 px-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Choose
            <span className="ml-auto font-normal normal-case tracking-normal">
              {choices.length} option{choices.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Hide options"
              className="-mr-0.5 rounded p-0.5 transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronDown className="size-3.5" />
            </button>
          </div>
          <div className="flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto custom-scroll">
            {choices.map((choice, i) => {
              const { title, desc } = splitChoice(choice.label);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!chatEnabled || busy}
                  onClick={() => sendChoice(choice.label)}
                  className="group flex items-start gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{renderInline(title)}</span>
                    {desc && (
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                        {renderInline(desc)}
                      </span>
                    )}
                  </span>
                  <span
                    aria-hidden="true"
                    className="mt-px flex size-5 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[11px] font-medium text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
                  >
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!chatEnabled}
            placeholder={!canChat ? "Start a session to chat" : "Message the agent…"}
            className="min-h-[40px] flex-1 resize-none text-sm focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button size="icon-lg" disabled={!chatEnabled || busy || !text.trim()} onClick={send} aria-label="Send">
            <Send className="size-3.5" />
          </Button>
        </div>
        {/* Agent status indicator under the input (Claude-Code-style footer); Stop when running. */}
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          {running && (
            <button
              type="button"
              onClick={stop}
              disabled={busy}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <Square className="size-3" /> Stop
            </button>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            <AgentDot status={status} />
            {title ? `${title} · ` : ""}
            {status ? STATUS_LABEL[status] ?? "Idle" : "Not started"}
          </span>
        </div>
      </div>
    </div>
  );
}
