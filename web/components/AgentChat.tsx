import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  Square,
  Send,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  Circle,
  CircleDot,
} from "lucide-react";
import type { AgentStatus, AgentView, AgentApproval } from "../api.ts";
import { useAgentStream } from "../hooks/useAgentStream.tsx";
import { AgentKeyContext, useExpanded } from "../lib/chatExpand.ts";
import { AgentDot } from "./AgentDot.tsx";
import { Markdown } from "./Markdown.tsx";
import { DiffView } from "./DiffView.tsx";
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
  { value: "supervised", label: "Supervised" },
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

/** A single todo item from a `TodoWrite` tool call. `status` is Claude Code's lifecycle enum;
 * `activeForm` is the present-tense label shown while in progress (unused for now — we render
 * `content`). */
type TodoItem = { content: string; status?: string; activeForm?: string };

/** A single flattened transcript row, after unpacking each stream event into its display pieces.
 * The renderer coalesces consecutive plain `tool` prims into one collapsible group; the rich
 * variants (`todo`, `plan`) and everything else render inline. Tool *results* no longer vanish —
 * they're folded onto their originating `tool` prim (by `tool_use_id`) as `resultText`/`isError`,
 * revealed on demand rather than dumped inline. */
type Prim =
  | { t: "you"; key: string; text: string; images?: string[] }
  | { t: "text"; key: string; text: string }
  | { t: "thinking"; key: string; text: string }
  | {
      t: "tool";
      key: string;
      id?: string;
      name: string;
      label: string;
      input: unknown;
      resultText?: string;
      isError?: boolean;
    }
  | {
      t: "diff";
      key: string;
      name: string;
      input: unknown;
      resultText?: string;
      isError?: boolean;
    }
  | {
      t: "task";
      key: string;
      subagentType: string;
      description: string;
      resultText?: string;
      isError?: boolean;
    }
  | { t: "todo"; key: string; todos: TodoItem[] }
  | { t: "plan"; key: string; plan: string }
  | { t: "result"; key: string; label: string }
  | { t: "error"; key: string; text: string };

/** File-editing tools whose `tool_use` becomes a rich, non-groupable `diff` entry instead of a
 * plain "⏺ Edit file.ts" line. */
const DIFF_TOOLS = new Set(["Edit", "MultiEdit", "Write"]);

/** Flattens a tool_result's `content` (a string, or an array of `{type:"text",text}` blocks) into
 * one display string. Non-text blocks (images, etc.) are noted but not rendered. */
function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (c?.type === "text" && typeof c.text === "string" ? c.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** Walks the timeline once, collecting every tool_result (keyed by its `tool_use_id`) from the
 * `user` events, so `flattenTimeline` can fold each result onto the `tool` prim it belongs to. */
function collectToolResults(timeline: TimelineItem[]): Map<string, { content: string; isError: boolean }> {
  const map = new Map<string, { content: string; isError: boolean }>();
  for (const item of timeline) {
    if (item.kind !== "agent") continue;
    const e = item.event as Record<string, any> | null;
    if (!e || typeof e !== "object" || e.type !== "user") continue;
    const content = Array.isArray(e.message?.content) ? e.message.content : [];
    for (const block of content) {
      if (block?.type === "tool_result" && block.tool_use_id) {
        map.set(String(block.tool_use_id), {
          content: toolResultText(block.content),
          isError: block.is_error === true,
        });
      }
    }
  }
  return map;
}

/** Unpacks the ordered timeline into a flat list of display prims — one `you` bubble per sent
 * message, and per agent event its assistant text bubbles + tool lines. `TodoWrite`/`ExitPlanMode`
 * become rich `todo`/`plan` prims; other tools become `tool` prims with their matching result
 * (by `tool_use_id`) folded in. A `result` → a divider, a spawn_error/stderr → an error line.
 * Everything else (init/hook/stream_event, and the raw `user` tool_result events themselves once
 * harvested) is dropped as noise. */
function flattenTimeline(timeline: TimelineItem[]): Prim[] {
  const out: Prim[] = [];
  const results = collectToolResults(timeline);
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
          } else if (block?.type === "thinking" && block.thinking) {
            out.push({ t: "thinking", key: `k-${i}-${b}`, text: String(block.thinking) });
          } else if (block?.type === "tool_use") {
            const key = `u-${i}-${b}`;
            const res = block.id ? results.get(String(block.id)) : undefined;
            if (block.name === "TodoWrite") {
              const todos = Array.isArray(block.input?.todos) ? (block.input.todos as TodoItem[]) : [];
              out.push({ t: "todo", key, todos });
            } else if (block.name === "ExitPlanMode") {
              out.push({ t: "plan", key, plan: String(block.input?.plan ?? "") });
            } else if (DIFF_TOOLS.has(block.name)) {
              out.push({
                t: "diff",
                key,
                name: block.name,
                input: block.input,
                resultText: res?.content,
                isError: res?.isError,
              });
            } else if (block.name === "Task") {
              out.push({
                t: "task",
                key,
                subagentType: String(block.input?.subagent_type ?? "agent"),
                description: String(block.input?.description ?? block.input?.prompt ?? ""),
                resultText: res?.content,
                isError: res?.isError,
              });
            } else {
              out.push({
                t: "tool",
                key,
                id: block.id,
                name: block.name,
                label: toolSummary(block.name, block.input),
                input: block.input,
                resultText: res?.content,
                isError: res?.isError,
              });
            }
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
      // "user" (tool results — already harvested by collectToolResults), "stream_event", other
      // system subtypes → noise, skipped here.
    }
  });
  return out;
}

/** The renderable slice of a `tool` prim — the label, plus the folded-in result used for the
 * status dot and the reveal panel. */
type ToolPrimData = {
  key: string;
  name: string;
  label: string;
  input?: unknown;
  resultText?: string;
  isError?: boolean;
};

/** The collapsed header for a group of ≥2 consecutive tool calls. When the run is all one tool
 * type we summarize semantically ("Read 5 files", "Ran 3 commands", …) with an optional muted
 * detail (basenames for Read); a mixed run falls back to the generic "N tool calls". */
function groupHeader(tools: ToolPrimData[]): { main: string; detail?: string } {
  const n = tools.length;
  const name = tools[0].name;
  const same = tools.every((t) => t.name === name);
  if (!same) return { main: `${n} tool calls` };
  const arg = (t: ToolPrimData, keys: string[]) => {
    const inp = (t.input && typeof t.input === "object" ? t.input : {}) as Record<string, any>;
    for (const k of keys) if (inp[k] != null) return String(inp[k]);
    return "";
  };
  const basename = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
  const list = (vals: string[]) => {
    const nonEmpty = vals.filter(Boolean);
    if (nonEmpty.length === 0) return undefined;
    const shown = nonEmpty.slice(0, 3);
    const extra = nonEmpty.length - shown.length;
    return shown.join(", ") + (extra > 0 ? `, … +${extra}` : "");
  };
  switch (name) {
    case "Read":
      return { main: `Read ${n} files`, detail: list(tools.map((t) => basename(arg(t, ["file_path"])))) };
    case "Grep":
      return { main: `Searched ${n} times` };
    case "Glob":
      return { main: `Globbed ${n} times` };
    case "Bash":
      return { main: `Ran ${n} commands` };
    case "WebFetch":
      return { main: `Fetched ${n} pages` };
    case "WebSearch":
      return { main: `Ran ${n} web searches` };
    default:
      return { main: `${n} tool calls` };
  }
}

/** A small status dot for a tool line: green = succeeded (result present, not an error),
 * red = errored, hollow = still pending (no result folded in yet). */
function ToolStatusDot({ hasResult, isError }: { hasResult: boolean; isError?: boolean }) {
  const cls = !hasResult
    ? "border border-muted-foreground/60 bg-transparent"
    : isError
      ? "bg-destructive"
      : "bg-success";
  const title = !hasResult ? "pending" : isError ? "error" : "success";
  return <span aria-hidden title={title} className={`size-1.5 shrink-0 rounded-full ${cls}`} />;
}

const MCP_NAME_RE = /^mcp__/;
/** Result text is clamped to this many chars in the reveal; longer output gets a show-more toggle. */
const RESULT_CLAMP = 2000;

/** One compact "⏺ Read file.ts" tool line with a status dot. When it has a folded-in result (or is
 * an error) the whole row toggles a reveal panel: a scrollable mono `<pre>` of the result text,
 * clamped with a show-more for very long output. An MCP tool that errored (name `mcp__…`) shows a
 * clear "not available in this agent" notice instead of the raw dead-end error. */
function ToolLine({ tool }: { tool: ToolPrimData }) {
  const [open, setOpen] = useExpanded(tool.key);
  const [full, setFull] = useState(false);
  const hasResult = tool.resultText != null || tool.isError === true;
  const revealable = hasResult;
  const isMcpError = tool.isError === true && MCP_NAME_RE.test(tool.name);
  const text = tool.resultText ?? "";
  const clamped = !full && text.length > RESULT_CLAMP;
  const shown = clamped ? `${text.slice(0, RESULT_CLAMP)}…` : text;

  const row = (
    <span className="flex min-w-0 items-center gap-1.5">
      <ToolStatusDot hasResult={tool.resultText != null || tool.isError === true} isError={tool.isError} />
      <span className="shrink-0 text-primary">⏺</span>
      <span className="truncate">{tool.label}</span>
    </span>
  );

  return (
    <div className="flex max-w-full flex-col">
      {revealable ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex max-w-full items-center gap-1 rounded px-0.5 py-0.5 text-left font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {open ? (
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          ) : (
            <ChevronRight className="size-3 shrink-0 opacity-60" />
          )}
          {row}
        </button>
      ) : (
        <div className="flex max-w-full items-center gap-1 px-0.5 py-0.5 font-mono text-xs text-muted-foreground">
          <span className="size-3 shrink-0" />
          {row}
        </div>
      )}
      {open && revealable && (
        <div className="mt-0.5 ml-[15px] flex flex-col gap-1">
          {isMcpError ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
              ⚠ MCP tool {tool.name} isn't available in this agent (server not connected).
            </div>
          ) : (
            <>
              <pre
                className={`max-h-64 overflow-auto rounded ${tool.isError ? "bg-destructive/10 text-destructive" : "bg-muted/60 text-muted-foreground"} custom-scroll px-2 py-1.5 font-mono text-[11px] leading-snug whitespace-pre-wrap`}
              >
                {shown || "(no output)"}
              </pre>
              {text.length > RESULT_CLAMP && (
                <button
                  type="button"
                  onClick={() => setFull((f) => !f)}
                  className="self-start text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {full ? "Show less" : "Show more"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** A run of ≥2 consecutive tool calls, collapsed into one row ("N tool calls") that expands to
 * reveal the individual `⏺` lines under a hairline rail — each of which is itself independently
 * revealable (see `ToolLine`). Always starts collapsed — the count is usually all you want. */
function ToolGroup({ tools }: { tools: ToolPrimData[] }) {
  const [open, setOpen] = useExpanded(`g-${tools[0].key}`);
  const header = groupHeader(tools);
  return (
    <div className="flex max-w-full flex-col self-start">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex max-w-full items-center gap-1.5 self-start rounded px-1 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 opacity-70" />
        ) : (
          <ChevronRight className="size-3 shrink-0 opacity-70" />
        )}
        <span className="shrink-0 text-primary">⏺</span>
        <span className="shrink-0 font-medium text-foreground">{header.main}</span>
        {header.detail && <span className="truncate text-muted-foreground">{header.detail}</span>}
      </button>
      {open && (
        <div className="mt-1 ml-[9px] flex flex-col gap-0.5 border-l border-border pl-3">
          {tools.map((t) => (
            <ToolLine key={t.key} tool={t} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The icon for a todo item's lifecycle status. */
function todoIcon(status?: string) {
  switch ((status ?? "").toLowerCase()) {
    case "completed":
      return <Check aria-hidden className="size-3.5 text-success" />;
    case "in_progress":
      return <CircleDot aria-hidden className="size-3.5 text-primary" />;
    case "cancelled":
      return <Circle aria-hidden className="size-3.5 text-muted-foreground/60" />;
    default:
      return <Circle aria-hidden className="size-3.5 text-muted-foreground" />;
  }
}

/** A compact checklist rendered in place of the plain "⏺ TodoWrite" line — one row per todo with a
 * status icon (check / spinner-dot / circle) and its text (struck through when cancelled). Stays in
 * the transcript flow as its own rich entry (never swallowed into a "N tool calls" group). */
function TodoList({ todos }: { todos: TodoItem[] }) {
  return (
    <div className="flex max-w-[85%] flex-col gap-1 self-start rounded-lg border border-border bg-card/60 px-3 py-2 text-sm">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Check className="size-3.5" /> Todos
      </div>
      <ul className="flex flex-col gap-1">
        {todos.map((todo, i) => {
          const cancelled = (todo.status ?? "").toLowerCase() === "cancelled";
          const completed = (todo.status ?? "").toLowerCase() === "completed";
          return (
            <li key={`${todo.content}-${i}`} className="flex items-start gap-2">
              <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
                {todoIcon(todo.status)}
              </span>
              <span
                className={`leading-5 break-words ${cancelled ? "text-muted-foreground/60 line-through" : completed ? "text-muted-foreground" : "text-foreground"}`}
              >
                {todo.content}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A titled "Plan" card for an `ExitPlanMode` tool call — renders the agent's proposed plan
 * (markdown) via `<Markdown>`. Non-groupable rich entry like `TodoList`. */
function PlanCard({ plan }: { plan: string }) {
  return (
    <div className="flex w-full max-w-[85%] flex-col gap-1.5 self-start rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-primary">Plan</div>
      <Markdown>{plan}</Markdown>
    </div>
  );
}

/** A muted, collapsible "Thinking" block rendered from an assistant `thinking` content block.
 * Collapsed by default (the reasoning is available on demand, not in your face); expanding renders
 * the thinking text as markdown. Distinct from the live animated "thinking…" indicator, which is
 * only for the in-progress state — this is for reasoning content that has arrived. */
function ThinkingBlock({ id, text }: { id: string; text: string }) {
  const [open, setOpen] = useExpanded(id);
  return (
    <div className="flex w-full max-w-[85%] flex-col self-start">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start rounded px-1 py-0.5 text-xs italic text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        ) : (
          <ChevronRight className="size-3 shrink-0 opacity-60" />
        )}
        <span>Thinking</span>
      </button>
      {open && (
        <div className="mt-1 ml-[15px] border-l-2 border-border pl-3 text-muted-foreground">
          <Markdown>{text}</Markdown>
        </div>
      )}
    </div>
  );
}

/** A card for a `Task` (subagent) tool call: a badge with the `subagent_type`, the `description`,
 * and — reusing ToolLine's reveal mechanism — the subagent's output revealed on expand. Rich,
 * non-groupable (never absorbed into a "N tool calls" group). */
function SubagentCard({
  id,
  subagentType,
  description,
  resultText,
  isError,
}: {
  id: string;
  subagentType: string;
  description: string;
  resultText?: string;
  isError?: boolean;
}) {
  const [open, setOpen] = useExpanded(id);
  const [full, setFull] = useState(false);
  const hasResult = resultText != null || isError === true;
  const text = resultText ?? "";
  const clamped = !full && text.length > RESULT_CLAMP;
  const shown = clamped ? `${text.slice(0, RESULT_CLAMP)}…` : text;

  return (
    <div className="flex w-full max-w-[85%] flex-col gap-1.5 self-start rounded-lg border border-border bg-card/60 px-3 py-2">
      <button
        type="button"
        onClick={() => hasResult && setOpen(!open)}
        aria-expanded={open}
        disabled={!hasResult}
        className="flex items-center gap-2 text-left disabled:cursor-default"
      >
        {hasResult ? (
          open ? (
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          ) : (
            <ChevronRight className="size-3 shrink-0 opacity-60" />
          )
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <ToolStatusDot hasResult={hasResult} isError={isError} />
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-primary">
          {subagentType}
        </span>
        {description && <span className="truncate text-sm text-foreground">{description}</span>}
      </button>
      {open && hasResult && (
        <div className="ml-[15px] flex flex-col gap-1">
          <pre
            className={`max-h-64 overflow-auto rounded ${isError ? "bg-destructive/10 text-destructive" : "bg-muted/60 text-muted-foreground"} custom-scroll px-2 py-1.5 font-mono text-[11px] leading-snug whitespace-pre-wrap`}
          >
            {shown || "(no output)"}
          </pre>
          {text.length > RESULT_CLAMP && (
            <button
              type="button"
              onClick={() => setFull((f) => !f)}
              className="self-start text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {full ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Renders the flattened prims, coalescing runs of ≥2 consecutive tool calls into one
 * collapsible `ToolGroup`; a lone tool call stays a plain inline line. */
function renderPrims(prims: Prim[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  let run: ToolPrimData[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const group = run;
    run = [];
    if (group.length === 1) {
      nodes.push(<ToolLine key={group[0].key} tool={group[0]} />);
    } else {
      nodes.push(<ToolGroup key={`g-${group[0].key}`} tools={group} />);
    }
  };
  for (const p of prims) {
    if (p.t === "tool") {
      run.push({
        key: p.key,
        name: p.name,
        label: p.label,
        input: p.input,
        resultText: p.resultText,
        isError: p.isError,
      });
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
          <div key={p.key} className="max-w-[85%] self-start rounded-lg bg-accent/60 px-3 py-2">
            <Markdown>{p.text}</Markdown>
          </div>,
        );
        break;
      case "thinking":
        nodes.push(<ThinkingBlock key={p.key} id={p.key} text={p.text} />);
        break;
      case "diff":
        nodes.push(
          <DiffView
            key={p.key}
            id={p.key}
            name={p.name}
            input={p.input}
            hasResult={p.resultText != null || p.isError === true}
            isError={p.isError}
          />,
        );
        break;
      case "task":
        nodes.push(
          <SubagentCard
            key={p.key}
            id={p.key}
            subagentType={p.subagentType}
            description={p.description}
            resultText={p.resultText}
            isError={p.isError}
          />,
        );
        break;
      case "todo":
        nodes.push(<TodoList key={p.key} todos={p.todos} />);
        break;
      case "plan":
        nodes.push(<PlanCard key={p.key} plan={p.plan} />);
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

/** The token accounting we surface in the footer gauge: the four raw counters Claude Code reports
 * (`usage.input_tokens` / `output_tokens` / `cache_read_input_tokens` / `cache_creation_input_tokens`),
 * their sum, and the model's context window (best-effort — a sane default when unknown). */
type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  total: number;
  contextWindow: number;
};

/** Fallback context window when we can't infer the model's real one from the stream. Claude Code
 * models are ≥200k, so this keeps the gauge honest-ish without over-claiming. */
const DEFAULT_CONTEXT_WINDOW = 200_000;

/** Parses a raw Claude Code `usage` object into our `Usage`, summing the four token counters.
 * Returns null when there's nothing meaningful (no object / all-zero) so callers can hide the gauge. */
function parseUsage(u: unknown): Usage | null {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, any>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const input = num(o.input_tokens);
  const output = num(o.output_tokens);
  const cacheRead = num(o.cache_read_input_tokens);
  const cacheCreation = num(o.cache_creation_input_tokens);
  const total = input + output + cacheRead + cacheCreation;
  if (total <= 0) return null;
  return { input, output, cacheRead, cacheCreation, total, contextWindow: DEFAULT_CONTEXT_WINDOW };
}

/** The latest known token usage for the session: prefer the most recent `result` event's usage
 * (the authoritative end-of-turn tally), falling back to the most recent assistant `message.usage`
 * (the running turn). Returns null until any usage has arrived. */
function latestUsage(timeline: TimelineItem[]): Usage | null {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const item = timeline[i];
    if (item.kind !== "agent") continue;
    const e = item.event as Record<string, any> | null;
    if (e?.type === "result") {
      const u = parseUsage(e.usage);
      if (u) return u;
    }
  }
  for (let i = timeline.length - 1; i >= 0; i--) {
    const item = timeline[i];
    if (item.kind !== "agent") continue;
    const e = item.event as Record<string, any> | null;
    if (e?.type === "assistant") {
      const u = parseUsage(e.message?.usage);
      if (u) return u;
    }
  }
  return null;
}

/** Compact token count formatter: 1234 → "1k", 128000 → "128k", 2_500_000 → "2.5M". */
function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/** A small, muted context-usage indicator for the composer footer: a thin progress ring (color
 * shifting toward amber/red as the window fills) plus a "used / window" label, with a tooltip
 * breaking down input/output/cache tokens. Rendered only when usage exists (see the footer). */
function ContextUsage({ usage }: { usage: Usage }) {
  const pct = Math.min(1, usage.total / usage.contextWindow);
  const pctLabel = Math.round(pct * 100);
  const r = 6;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct);
  const ring = pct >= 0.9 ? "text-destructive" : pct >= 0.75 ? "text-amber-500" : "text-primary";
  const n = (v: number) => v.toLocaleString();
  const tip =
    `Context: ${n(usage.total)} / ${n(usage.contextWindow)} tokens (${pctLabel}%)\n` +
    `input ${n(usage.input)} · output ${n(usage.output)} · ` +
    `cache read ${n(usage.cacheRead)} · cache write ${n(usage.cacheCreation)}`;
  return (
    <span
      className="flex items-center gap-1"
      title={tip}
      aria-label={`Context usage ${pctLabel}%`}
    >
      <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90" aria-hidden>
        <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={off}
          className={`${ring} transition-[stroke-dashoffset] duration-500 ease-out`}
        />
      </svg>
      <span className="tabular-nums">
        {formatTokens(usage.total)} / {formatTokens(usage.contextWindow)}
      </span>
    </span>
  );
}

/** An inline Approve/Deny gate for a supervised per-tool approval. Shows the tool name prominently,
 * a compact one-line summary (via `toolSummary`), and a truncated raw-input preview. The two buttons
 * disable themselves while a decision is in flight; the store removes the card once the
 * `agent-approval-resolved` frame arrives (source of truth), so we don't remove it locally. */
function ApprovalCard({
  approval,
  onResolve,
}: {
  approval: AgentApproval;
  onResolve: (approvalId: string, decision: "allow" | "deny", reason?: string) => Promise<unknown> | void;
}) {
  const [busy, setBusy] = useState(false);
  const summary = toolSummary(approval.toolName, approval.input);
  const raw = (() => {
    try {
      return JSON.stringify(approval.input, null, 2);
    } catch {
      return String(approval.input);
    }
  })();
  const preview = raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;

  const decide = async (decision: "allow" | "deny") => {
    setBusy(true);
    try {
      await onResolve(approval.id, decision);
    } catch (err) {
      toast.error(String(err));
      setBusy(false); // keep the card actionable on failure; success removal comes from the store
    }
  };

  return (
    <div className="flex w-full max-w-[85%] flex-col gap-2 self-start rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
          !
        </span>
        <span className="text-sm font-semibold text-foreground">{approval.toolName}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">wants to run</span>
      </div>
      <div className="font-mono text-xs text-muted-foreground">{summary}</div>
      <pre className="max-h-32 overflow-auto rounded bg-muted/60 px-2 py-1.5 font-mono text-[11px] leading-snug whitespace-pre-wrap text-muted-foreground">
        {preview}
      </pre>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => decide("allow")}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("deny")}>
          Deny
        </Button>
      </div>
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
  onResolveApproval,
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
  onBackfill?: () => Promise<{ agent: AgentView | null; events: unknown[]; approvals?: AgentApproval[] }>;
  /** Resolves a supervised per-tool approval (Approve/Deny card). Optional so tests and non-
   * supervised callers can omit it — the cards only appear when there are pending approvals. */
  onResolveApproval?: (approvalId: string, decision: "allow" | "deny", reason?: string) => Promise<unknown>;
}) {
  const { agentFor, setActiveKey, seedApprovals } = useAgentStream();
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
  // Images pasted/dropped into the composer, staged until the next send (removable thumbnails).
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachSeq = useRef(0);
  // Client-side message queue: messages the user submits WHILE the agent is actively working
  // (`status === "working"`) are parked here instead of sent, so they can keep typing the next
  // one. When the agent next goes idle, the HEAD is auto-dequeued and sent (one per idle
  // transition — see the effect below). Each item captures the composer text + staged attachments
  // at enqueue time; the thinking keyword is applied at SEND time (consistent with `sendText`).
  const [queue, setQueue] = useState<{ id: string; text: string; images: Attachment[] }[]>([]);
  const queueSeq = useRef(0);
  const transcriptRef = useRef<HTMLDivElement>(null);
  // Drag-and-drop overlay state. `dragDepth` counts enter/leave over nested children so the
  // "Drop images to attach" overlay doesn't flicker as the pointer crosses child elements.
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);

  // Shared "image File → staged Attachment" logic used by BOTH the paste and the drop handlers:
  // read the file as a base64 data URL, split off the raw base64 for the API, and append a
  // thumbnail-able attachment.
  const stageImageFile = (file: File) => {
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
  };

  // Paste-to-attach: pull image files off the clipboard and stage them. preventDefault stops the
  // browser also pasting the image's name as text into the box.
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItems = Array.from(e.clipboardData?.items ?? []).filter(
      (it) => it.kind === "file" && it.type.startsWith("image/"),
    );
    if (imageItems.length === 0) return;
    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) stageImageFile(file);
    }
  };
  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  // Drag-and-drop-to-attach. A drag carrying files toggles the overlay (via the enter/leave depth
  // counter); dragover preventDefault marks the pane a valid drop target. On drop we preventDefault
  // (so the browser doesn't navigate to the file), stage the image files, and ignore the rest.
  const dragHasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const onDragEnter = (e: React.DragEvent) => {
    if (!canChat || !dragHasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!canChat || !dragHasFiles(e)) return;
    e.preventDefault(); // required so the drop event fires
    if (!dragActive) setDragActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer?.files ?? []);
    dragDepth.current = 0;
    setDragActive(false);
    if (files.length === 0) return;
    e.preventDefault();
    if (!canChat) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    for (const file of images) stageImageFile(file);
    if (images.length === 0) toast("Only image files can be attached.");
  };

  // Backfill the transcript from the server once, if nothing has streamed in live yet.
  useEffect(() => {
    if (!onBackfill || live.events.length > 0) return;
    let cancelled = false;
    onBackfill()
      .then((res) => {
        if (cancelled) return;
        setBackfill(res.events ?? []);
        setBackfillStatus(res.agent?.status);
        // Re-populate outstanding gates that arrived before this cockpit was listening.
        if (res.approvals && res.approvals.length > 0) seedApprovals(agentKey, res.approvals);
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

  // Follow-only-when-at-bottom scrolling. We auto-pin to the bottom on new content ONLY if the user
  // was already there; if they've scrolled up to read history we leave them put (and surface a
  // "Jump to bottom" pill). `atBottomRef` mirrors `isAtBottom` so the content-growth effect can read
  // the latest value without re-subscribing on every scroll.
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasUnread, setHasUnread] = useState(false);
  const atBottomRef = useRef(true);
  const prevLenRef = useRef(0);

  const onTranscriptScroll = () => {
    const el = transcriptRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    atBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
    if (atBottom) setHasUnread(false);
  };

  const scrollToBottom = () => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setIsAtBottom(true);
    setHasUnread(false);
  };

  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const grew = timeline.length > prevLenRef.current;
    prevLenRef.current = timeline.length;
    // At bottom → keep following (covers new messages, status/approval-driven height changes, and
    // the initial mount, since atBottomRef starts true). Scrolled up → only flag unread on actual
    // new timeline content, never yank the viewport.
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      setHasUnread(false);
    } else if (grew) {
      setHasUnread(true);
    }
  }, [timeline.length, status, live.approvals.length]);

  // Latest known token usage for the session, recomputed as the transcript grows (cheap: two
  // backward scans that early-exit). null until any usage has streamed in → the gauge stays hidden.
  const usage = useMemo(() => latestUsage(timeline), [timeline]);

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
  // Core send: append the user's own "You" bubble to the timeline immediately (independent of
  // whatever the agent does next), then forward the message (with the thinking keyword applied)
  // to the agent, auto-starting it first if it isn't running. Returns whether it succeeded. Used
  // by both the composer path (`sendText`) and the queue auto-drain effect.
  const sendMessage = async (value: string, imgs: Attachment[]): Promise<boolean> => {
    const t = value.trim();
    if (!t && imgs.length === 0) return false;
    // The bubble shows exactly what the user typed; the thinking keyword is appended only to what
    // the agent receives (so a "Think hard" setting doesn't visibly clutter the transcript).
    const keyword = THINKING_KEYWORD[thinking];
    const outgoing = keyword ? `${t}\n\n${keyword}` : t;
    setTimeline((prev) => [...prev, { kind: "you", text: t, images: imgs.map((a) => a.url) }]);
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
  // Send path for the free-text composer: pulls the currently-staged attachments, clears them,
  // and delivers the message. Returns whether the send succeeded.
  const sendText = async (value: string): Promise<boolean> => {
    const imgs = attachments;
    if (!value.trim() && imgs.length === 0) return false;
    setAttachments([]);
    return sendMessage(value, imgs);
  };
  // Enqueue the current composer contents as a pending message, then clear the composer +
  // attachments so the user can keep typing the next one.
  const enqueue = () => {
    const t = text.trim();
    if (!t && attachments.length === 0) return;
    const id = `q-${(queueSeq.current += 1)}`;
    const imgs = attachments;
    setQueue((prev) => [...prev, { id, text: t, images: imgs }]);
    setText("");
    setAttachments([]);
  };
  const removeQueued = (id: string) => setQueue((prev) => prev.filter((q) => q.id !== id));
  // Composer submit (Send button / Enter). While the agent is actively working, park the message
  // in the queue instead of sending — it drains on the next idle (see the effect below). Otherwise
  // send immediately (auto-starting the agent if needed), matching the prior behavior.
  const send = async () => {
    if (status === "working") {
      enqueue();
      return;
    }
    if (await sendText(text)) setText("");
  };

  // Auto-drain the queue: when the agent transitions out of "working" into a non-working ready
  // state, dequeue the HEAD and send it. Exactly one per idle transition — the next drains when
  // that turn finishes and the agent goes idle again. Guarded by `busy` so a send already in
  // flight doesn't get doubled; if we skip (busy), the item stays queued for a later transition.
  const prevStatusRef = useRef<AgentStatus | undefined>(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev !== "working" || status === "working") return;
    if (busy || queue.length === 0) return;
    const head = queue[0];
    setQueue((q) => q.slice(1));
    void sendMessage(head.text, head.images);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, busy, queue]);

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
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-background/80 text-sm font-medium text-primary backdrop-blur-sm">
          Drop images to attach
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={transcriptRef}
          onScroll={onTranscriptScroll}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto custom-scroll p-4"
        >
          <AgentKeyContext.Provider value={agentKey}>
            {timeline.length === 0 && status !== "working" ? (
              <p className="text-sm text-muted-foreground">
                {!canChat
                  ? "Start a session to chat with an agent here."
                  : "Send a message to begin — the agent starts on your first message."}
              </p>
            ) : (
              renderPrims(flattenTimeline(timeline))
            )}
            {onResolveApproval &&
              live.approvals.map((appr) => (
                <ApprovalCard key={appr.id} approval={appr} onResolve={onResolveApproval} />
              ))}
            {status === "working" && <ThinkingRow />}
          </AgentKeyContext.Provider>
        </div>
        {!isAtBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Jump to bottom"
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground"
          >
            <ChevronDown className="size-3.5" />
            Jump to bottom
            {hasUnread && (
              <span aria-hidden className="ml-0.5 size-1.5 rounded-full bg-primary" />
            )}
          </button>
        )}
      </div>

      <div className="border-t border-border p-3">
        {queue.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Queued ({queue.length})
            </span>
            <div className="flex flex-col gap-1">
              {queue.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
                >
                  <span className="min-w-0 flex-1 truncate">{q.text || "(image only)"}</span>
                  {q.images.length > 0 && (
                    <span className="shrink-0 rounded bg-accent px-1 py-0.5 text-[10px] tabular-nums">
                      {q.images.length} img
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeQueued(q.id)}
                    aria-label="Cancel queued message"
                    className="flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
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
          {usage && (
            <span className="ml-auto">
              <ContextUsage usage={usage} />
            </span>
          )}
          <span className={`flex items-center gap-1.5 ${usage ? "" : "ml-auto"}`}>
            <AgentDot status={status} />
            {title ? `${title} · ` : ""}
            {status ? STATUS_LABEL[status] ?? "Idle" : "Not started"}
          </span>
        </div>
      </div>
    </div>
  );
}
