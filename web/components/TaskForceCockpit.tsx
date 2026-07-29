import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Play, Square, Send, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import {
  api,
  type TaskForce,
  type AgentStatus,
  type RunningServer,
  type LogLine,
} from "../api.ts";
import { useAgentStream } from "../hooks/useAgentStream.tsx";
import { AgentDot } from "./FactorySidebar.tsx";
import { GitlabSection } from "./GitlabSection.tsx";
import { LinearLink } from "./LinearLink.tsx";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { isTauri } from "../lib/version.ts";
import { parseChoices } from "../lib/parseChoices.ts";

/** One entry in the cockpit's local timeline: either the user's own sent message (never
 * echoed back by the stream — it goes straight to stdin) or a raw agent stream-json event. */
type TimelineItem = { kind: "you"; text: string } | { kind: "agent"; event: unknown };

const STATUS_LABEL: Record<string, string> = {
  idle: "Idle",
  working: "Working",
  awaitingInput: "Awaiting input",
  done: "Done",
  failed: "Failed",
};

/** True while the agent process is actually alive and able to receive a message. */
function isRunningStatus(status: AgentStatus | undefined): boolean {
  return status === "working" || status === "awaitingInput";
}

/** Find the first localhost URL a dev server printed, so it can be opened.
 * Mirrors ItemDrawer's helper of the same name — kept local since it isn't exported there. */
function findServerUrl(logs: LogLine[]): string | null {
  const re = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+(?:\/\S*)?/;
  for (const l of logs) {
    const m = l.text.match(re);
    if (m) return m[0].replace(/0\.0\.0\.0/, "localhost");
  }
  return null;
}

/** Maps one raw stream-json event to a transcript row, per the mapping in the task brief:
 * assistant text -> a bubble, assistant tool_use -> a compact "✎ name" line, user tool-result
 * -> a compact bubble, result -> a turn divider/summary, system spawn_error/stderr -> an error
 * line, and everything else (stream_event, other system subtypes) is noise and skipped. */
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

/** Branch/worktree summary card plus a minimal dev-server start/URL control, scoped to this
 * task force's worktree. Mirrors ItemDrawer's dev-server pattern (Play/Square + findServerUrl)
 * without pulling in its full log-streaming wiring — a Start/Stop + refresh is enough here. */
function AssetsRail({
  project,
  taskForce,
  linearWorkspace,
}: {
  project: string;
  taskForce: TaskForce;
  linearWorkspace: string;
}) {
  const [server, setServer] = useState<RunningServer | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getServer(project);
      const mine = s && s.cwd === taskForce.worktreePath ? s : null;
      setServer(mine);
      if (mine) {
        const lines = await api.getLogs(project);
        setUrl(findServerUrl(lines));
      } else {
        setUrl(null);
      }
    } catch {
      /* no server yet */
    }
  }, [project, taskForce.worktreePath]);

  useEffect(() => {
    if (isTauri) refresh();
  }, [refresh]);

  const running = server?.status === "running" || server?.status === "starting";

  const start = async () => {
    setBusy(true);
    try {
      const s = await api.startServer(project, { cwd: taskForce.worktreePath, branch: taskForce.branch });
      setServer(s);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try {
      await api.stopServer(project);
      setServer(null);
      setUrl(null);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Branch</h3>
        <div className="truncate font-mono text-sm">{taskForce.branch}</div>
        <div className="truncate text-xs text-muted-foreground">
          base: <span className="font-mono">{taskForce.baseBranch}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          worktree: <span className="font-mono">{taskForce.worktreePath}</span>
        </div>
        {taskForce.linearTicket &&
          (linearWorkspace ? (
            <LinearLink id={taskForce.linearTicket} workspace={linearWorkspace} />
          ) : (
            <span className="font-mono text-xs text-muted-foreground">{taskForce.linearTicket}</span>
          ))}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dev server</h3>
        <div className="flex gap-2">
          {running ? (
            <Button size="sm" variant="destructive" disabled={busy} onClick={stop}>
              <Square className="size-3.5" /> Stop server
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={start}>
              <Play className="size-3.5" /> Start server
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={refresh}>
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
        </div>
        {url && (
          <a
            href={url}
            onClick={(ev) => {
              ev.preventDefault();
              api.openIn(project, "url", { url }).catch((err) => toast.error(String(err)));
            }}
            className="truncate font-mono text-xs text-[var(--success)] hover:underline"
          >
            {url}
          </a>
        )}
      </div>

      <GitlabSection project={project} branch={taskForce.branch} defaultTarget={taskForce.baseBranch} />
    </div>
  );
}

export function TaskForceCockpit({ project, taskForce }: { project: string; taskForce: TaskForce }) {
  const key = `${project}::${taskForce.id}`;
  const { agentFor, setActiveKey } = useAgentStream();
  const live = agentFor(key);

  // Viewing a task force clears its unread and suppresses further increments while it's
  // the active pane; leaving it (unmount, since the cockpit remounts per task force via
  // its `key`) lets new events for it accrue unread again.
  useEffect(() => {
    setActiveKey(key);
    return () => setActiveKey(null);
  }, [key, setActiveKey]);

  const [backfill, setBackfill] = useState<unknown[]>([]);
  const [backfillStatus, setBackfillStatus] = useState<AgentStatus | undefined>(undefined);
  const [linearWorkspace, setLinearWorkspace] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Passive on-mount lookups only matter in the desktop app.
  useEffect(() => {
    if (!isTauri) return;
    api.getConfig().then((c) => setLinearWorkspace(c.linearWorkspace)).catch(() => {});
  }, []);

  // Backfill the transcript from the server once, if nothing has streamed in live yet.
  useEffect(() => {
    if (!isTauri || live.events.length > 0) return;
    let cancelled = false;
    api.factory
      .getAgent(project, taskForce.id)
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
  }, [key]);

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
      await api.factory.agentStart(project, taskForce.id);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try {
      await api.factory.agentStop(project, taskForce.id);
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
      await api.factory.agentMessage(project, taskForce.id, t);
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

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <SidebarTrigger className="shrink-0" />
        <h1 className="truncate text-lg font-semibold">{taskForce.name}</h1>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left pane: agent chat */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-border">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <AgentDot status={status} />
            <span className="text-sm text-muted-foreground">{STATUS_LABEL[status ?? "idle"] ?? "Idle"}</span>
            <div className="ml-auto flex gap-2">
              {running ? (
                <Button size="sm" variant="destructive" disabled={busy} onClick={stop}>
                  <Square className="size-3.5" /> Stop
                </Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={start}>
                  <Play className="size-3.5" /> Start
                </Button>
              )}
            </div>
          </div>

          <div ref={transcriptRef} className="flex flex-1 flex-col gap-2 overflow-y-auto custom-scroll p-4">
            {timeline.length === 0 && status !== "working" ? (
              <p className="text-sm text-muted-foreground">No activity yet. Start the agent to begin.</p>
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
                      disabled={!running || busy}
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
              disabled={!running}
              placeholder={running ? "Message the agent…" : "Start the agent to chat"}
              className="min-h-[40px] flex-1 resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Button size="sm" disabled={!running || busy || !text.trim()} onClick={send} aria-label="Send">
              <Send className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Right pane: assets rail */}
        <div className="w-[340px] shrink-0 overflow-y-auto custom-scroll p-4">
          <AssetsRail project={project} taskForce={taskForce} linearWorkspace={linearWorkspace} />
        </div>
      </div>
    </>
  );
}
