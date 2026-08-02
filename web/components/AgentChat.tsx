import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Square, Send, ChevronDown, ChevronRight, X } from "lucide-react";
import type { AgentStatus, AgentView } from "../api.ts";
import { useAgentStream } from "../hooks/useAgentStream.tsx";
import { AgentDot } from "./AgentDot.tsx";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** One entry in the chat's local timeline: either the user's own sent message (never echoed
 * back by the stream — it goes straight to stdin) or a raw agent stream-json event. `images` are
 * data-URL previews of any pasted images that went with the message. */
type TimelineItem =
  | { kind: "you"; text: string; images?: string[] }
  | { kind: "agent"; event: unknown };

/** A pasted image staged in the composer, awaiting send. `data` is the raw base64 (no data-URL
 * prefix) for the API; `url` is the full data URL for the thumbnail preview. */
type Attachment = { id: string; url: string; mediaType: string; data: string };

const STATUS_LABEL: Record<string, string> = {
  idle: "Ready",
  working: "Working",
  awaitingInput: "Awaiting input",
  done: "Done",
  failed: "Failed",
};

/** Model options for the composer dropdown. Empty value = "Default" (use the configured/global
 * model — no `--model` flag). The others are Claude Code's model aliases. */
const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Default" },
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
];

/** Permission-mode options for the composer dropdown. Applied as a launch arg (`--permission-mode`)
 * per-branch, mirroring the model override: changing it restarts the agent (resuming its session).
 * "Bypass" (bypassPermissions) lets tool calls auto-proceed instead of stalling on prompts. */
const PERMISSION_OPTIONS: { value: string; label: string }[] = [
  { value: "acceptEdits", label: "Accept edits" },
  { value: "plan", label: "Plan" },
  { value: "bypassPermissions", label: "Bypass" },
];

/** "Performance" = thinking budget, applied by appending Claude Code's magic keyword to the
 * outgoing message (higher keyword → larger budget). "off" appends nothing. */
const THINKING_KEYWORD = {
  off: "",
  think: "think",
  hard: "think hard",
  ultra: "ultrathink",
} as const;

const THINKING_OPTIONS: { value: keyof typeof THINKING_KEYWORD; label: string }[] = [
  { value: "off", label: "Thinking: off" },
  { value: "think", label: "Think" },
  { value: "hard", label: "Think hard" },
  { value: "ultra", label: "Ultrathink" },
];

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
 * `` `code` `` → a mono chip. Everything else is plain text (JSX-escaped). Used so assistant text
 * like "**Metronome** — …" reads as formatted text instead of printing literal asterisks. */
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

/** A single flattened transcript row, after unpacking each stream event into its display pieces.
 * The renderer coalesces consecutive `tool` prims into one collapsible group; everything else
 * renders inline. Tool *results* (the raw `user` events) never become prims — they're the bulk of
 * the noise, and the `tool` line already says what ran. */
type Prim =
  | { t: "you"; key: string; text: string; images?: string[] }
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
      out.push({ t: "you", key: `you-${i}`, text: item.text, images: item.images });
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
            {p.images && p.images.length > 0 && (
              <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                {p.images.map((src, k) => (
                  <img
                    key={k}
                    src={src}
                    alt="pasted attachment"
                    className="size-20 rounded-md border border-border object-cover"
                  />
                ))}
              </div>
            )}
            {p.text && (
              <div className="max-w-[85%] self-end rounded-lg border border-border bg-card px-3 py-2 text-sm whitespace-pre-wrap">
                {p.text}
              </div>
            )}
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
  /** Starts (or, for an already-running agent, restarts) the agent. `opts.model` /
   * `opts.permissionMode` apply per-branch launch overrides — restarting resumes the persisted
   * session so context is kept. */
  onStart: (opts?: { model?: string; permissionMode?: string }) => Promise<unknown>;
  onMessage: (text: string, images?: { mediaType: string; data: string }[]) => Promise<unknown>;
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
  // Per-session agent parameters, set from the dropdowns under the composer. `model` and
  // `permissionMode` are launch args (changing either restarts the agent, resuming its session);
  // `thinking` is applied per-message by appending Claude Code's thinking-budget keyword to the
  // outgoing text (no restart).
  const [model, setModel] = useState("");
  const [permissionMode, setPermissionMode] = useState("acceptEdits");
  const [thinking, setThinking] = useState<keyof typeof THINKING_KEYWORD>("off");
  // Images pasted into the composer, staged until the next send (rendered as removable thumbnails).
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachSeq = useRef(0);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Paste-to-attach: pull image files off the clipboard, read them as base64 data URLs, and stage
  // them. preventDefault stops the browser also pasting the image's name as text into the box.
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItems = Array.from(e.clipboardData?.items ?? []).filter(
      (it) => it.kind === "file" && it.type.startsWith("image/"),
    );
    if (imageItems.length === 0) return;
    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result); // data:<mediaType>;base64,<data>
        const comma = url.indexOf(",");
        const data = comma >= 0 ? url.slice(comma + 1) : "";
        if (!data) return;
        const id = `att-${(attachSeq.current += 1)}`;
        setAttachments((prev) => [...prev, { id, url, mediaType: file.type, data }]);
      };
      reader.readAsDataURL(file);
    }
  };
  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

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
  // Send path for the free-text composer: append the user's own "You" bubble to the timeline
  // immediately (independent of whatever the agent does next), then forward it to the agent.
  // Returns whether the send succeeded.
  const sendText = async (value: string): Promise<boolean> => {
    const t = value.trim();
    const imgs = attachments;
    if (!t && imgs.length === 0) return false;
    // The bubble shows exactly what the user typed; the thinking keyword is appended only to what
    // the agent receives (so a "Think hard" setting doesn't visibly clutter the transcript).
    const keyword = THINKING_KEYWORD[thinking];
    const outgoing = keyword ? `${t}\n\n${keyword}` : t;
    setTimeline((prev) => [...prev, { kind: "you", text: t, images: imgs.map((a) => a.url) }]);
    setAttachments([]);
    setBusy(true);
    try {
      // Auto-start the agent on the first message so the user can just type — no explicit Start
      // click. `running` is false until an agent process is alive for this branch; onStart()
      // resolves once the process is spawned (stdin ready), then we deliver the message. The
      // selected model / permission mode are applied at launch.
      if (!running) await onStart({ model, permissionMode });
      await onMessage(
        outgoing,
        imgs.map((a) => ({ mediaType: a.mediaType, data: a.data })),
      );
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

  // Changing the model restarts a running agent with the new `--model` (resuming its session so
  // context is kept); for a not-yet-started agent it just records the choice for the next start.
  const changeModel = async (next: string) => {
    setModel(next);
    if (!running) return;
    setBusy(true);
    try {
      await onStart({ model: next, permissionMode });
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };

  // Changing the permission mode restarts a running agent with the new `--permission-mode`
  // (resuming its session); for a not-yet-started agent it just records the choice for next start.
  const changePermission = async (next: string) => {
    setPermissionMode(next);
    if (!running) return;
    setBusy(true);
    try {
      await onStart({ model, permissionMode: next });
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
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

      <div className="border-t border-border p-3">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div key={a.id} className="group relative">
                <img
                  src={a.url}
                  alt="pasted attachment"
                  className="size-16 rounded-md border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  aria-label="Remove image"
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            disabled={!chatEnabled}
            placeholder={!canChat ? "Start a session to chat" : "Message the agent… (paste an image to attach)"}
            className="min-h-[40px] flex-1 resize-none text-sm focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button
            size="icon-lg"
            disabled={!chatEnabled || busy || (!text.trim() && attachments.length === 0)}
            onClick={send}
            aria-label="Send"
          >
            <Send className="size-3.5" />
          </Button>
        </div>
        {/* Composer footer (Claude-Code-style): per-session model + permission + thinking controls
            on the left, Stop + agent status on the right. */}
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <select
            aria-label="Model"
            value={model}
            disabled={!chatEnabled || busy}
            onChange={(e) => changeModel(e.target.value)}
            className="rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground focus:border-border focus:outline-none disabled:opacity-50"
          >
            {MODEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Permission"
            value={permissionMode}
            disabled={!chatEnabled || busy}
            onChange={(e) => changePermission(e.target.value)}
            className="rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground focus:border-border focus:outline-none disabled:opacity-50"
          >
            {PERMISSION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Thinking"
            value={thinking}
            disabled={!chatEnabled}
            onChange={(e) => setThinking(e.target.value as keyof typeof THINKING_KEYWORD)}
            className="rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground focus:border-border focus:outline-none disabled:opacity-50"
          >
            {THINKING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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
