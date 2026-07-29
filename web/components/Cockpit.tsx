import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Play } from "lucide-react";
import {
  api,
  type Feature,
  type TaskForce,
  type Worktree,
  type Branch,
  type RunningServer,
  type LogLine,
} from "../api.ts";
import { useBranches } from "../queries.ts";
import { taskForceKey, worktreeKey } from "../lib/agentKey.ts";
import { type Entry, branchToEntry, worktreeToEntry } from "../lib/entries.ts";
import { AgentChat } from "./AgentChat.tsx";
import { WorktreeDetails } from "./WorktreeDetails.tsx";
import { Button } from "@/components/ui/button";
import { isTauri } from "../lib/version.ts";

export type CockpitTarget =
  // `feature` is optional: it isn't used by Cockpit today (no per-feature behavior yet), and
  // `TaskForceCockpit` — which delegates here — doesn't carry a `Feature` object today either
  // (see its own doc comment). Kept on the type for whoever wires up feature/breadcrumb display.
  | { kind: "taskForce"; feature?: Feature; taskForce: TaskForce }
  | { kind: "worktree"; worktree: Worktree }
  | { kind: "branch"; branch: Branch };

/** Find the first localhost URL a dev server printed, so it can be opened. Mirrors
 * ItemDrawer's/TaskForceCockpit's helper of the same name — kept local like those are. */
function findServerUrl(logs: LogLine[]): string | null {
  const re = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+(?:\/\S*)?/;
  for (const l of logs) {
    const m = l.text.match(re);
    if (m) return m[0].replace(/0\.0\.0\.0/, "localhost");
  }
  return null;
}

function targetTitle(target: CockpitTarget): string {
  if (target.kind === "taskForce") return target.taskForce.name;
  if (target.kind === "worktree") return target.worktree.branch ?? target.worktree.path;
  return target.branch.name;
}

/** A task force always has a worktree (created alongside it), so it always builds a
 * `worktree`-kind entry — unlike a plain branch, which is only a worktree entry once
 * "Start a session" has created one. */
function taskForceToEntry(taskForce: TaskForce, meta: Branch | undefined): Entry {
  return {
    id: `tf:${taskForce.id}`,
    kind: "worktree",
    name: taskForce.branch,
    head: null,
    current: false,
    isMain: false,
    locked: false,
    upstream: meta?.upstream ?? null,
    behind: meta?.behind ?? 0,
    branchName: taskForce.branch,
    author: null,
    ts: taskForce.createdAt,
    dateRel: null,
    cwd: taskForce.worktreePath,
    runBranch: null,
    inWorktree: null,
    remoteOnly: false,
    dirty: false,
    linearId: taskForce.linearTicket ?? null,
    baseBranch: taskForce.baseBranch,
  };
}

/**
 * The unified cockpit — chat (left) + details (right) — for a task force, a plain worktree, or
 * a bare branch. Extracted so `TaskForceCockpit` can delegate to it (Task 7) and a later task
 * can wire it in for worktrees/branches too (see docs/superpowers/plans/2026-07-29-worktree-cockpit.md).
 *
 * For a `branch` target with no worktree yet, chat is disabled (`AgentChat canChat={false}`) and
 * a "Start a session" banner offers to `createWorktree` — on success this transitions to a
 * `worktree` target, either by lifting it to the caller via `onStarted` (so the caller's own
 * selection/breadcrumb/sidebar stay in sync) or, if that's not supplied, by tracking it locally.
 */
export function Cockpit({
  project,
  target,
  onStarted,
}: {
  project: string;
  target: CockpitTarget;
  onStarted?: (worktree: Worktree) => void;
}) {
  const [localTarget, setLocalTarget] = useState<CockpitTarget | null>(null);
  useEffect(() => setLocalTarget(null), [target]);
  const effective = localTarget ?? target;

  // Branch metadata (upstream/behind) for the entry — the same query OverviewTab already uses
  // for its list, so this rides on react-query's cache rather than re-fetching separately.
  const branches = useBranches(project).data ?? [];
  const branchByName = useMemo(() => new Map(branches.map((b) => [b.name, b])), [branches]);

  const entry: Entry = useMemo(() => {
    if (effective.kind === "taskForce") {
      return taskForceToEntry(effective.taskForce, branchByName.get(effective.taskForce.branch));
    }
    if (effective.kind === "worktree") {
      const w = effective.worktree;
      return worktreeToEntry(w, w.branch ? branchByName.get(w.branch) : undefined, null);
    }
    return branchToEntry(effective.branch, null, false);
  }, [effective, branchByName]);

  const agentKey =
    effective.kind === "taskForce"
      ? taskForceKey(project, effective.taskForce.id)
      : effective.kind === "worktree"
        ? worktreeKey(project, effective.worktree.path)
        : // A bare branch never has a real agent (canChat is false below) — a stable, inert key
          // is enough so useAgentStream has somewhere to look it up.
          worktreeKey(project, `branch:${effective.branch.name}`);

  const [linearWorkspace, setLinearWorkspace] = useState("");
  useEffect(() => {
    if (!isTauri) return;
    api
      .getConfig()
      .then((c) => setLinearWorkspace(c.linearWorkspace))
      .catch(() => {});
  }, []);

  // Dev server — scoped to this entry's cwd (mirrors the original TaskForceCockpit's
  // AssetsRail, generalized: bare-branch entries have no cwd, so there's nothing to scope to).
  const [server, setServer] = useState<RunningServer | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [serverBusy, setServerBusy] = useState(false);
  const cwd = entry.cwd;

  const refreshServer = useCallback(async () => {
    if (!cwd) {
      setServer(null);
      setUrl(null);
      return;
    }
    try {
      const s = await api.getServer(project);
      const mine = s && s.cwd === cwd ? s : null;
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
  }, [project, cwd]);

  useEffect(() => {
    if (isTauri) refreshServer();
  }, [refreshServer]);

  const startServer = async () => {
    if (!cwd) return;
    setServerBusy(true);
    try {
      const s = await api.startServer(project, { cwd, branch: entry.branchName });
      setServer(s);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setServerBusy(false);
    }
  };
  const stopServer = async () => {
    setServerBusy(true);
    try {
      await api.stopServer(project);
      setServer(null);
      setUrl(null);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setServerBusy(false);
    }
  };

  const [creating, setCreating] = useState(false);
  const startSession = async () => {
    if (effective.kind !== "branch") return;
    setCreating(true);
    try {
      const wt = await api.createWorktree(project, effective.branch.name);
      setLocalTarget({ kind: "worktree", worktree: wt });
      onStarted?.(wt);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setCreating(false);
    }
  };

  // Agent calls dispatch to the task-force or worktree family depending on the target kind — a
  // bare branch has neither (chat is disabled for it, so these are never actually invoked).
  const startAgent = async () => {
    if (effective.kind === "taskForce") await api.factory.agentStart(project, effective.taskForce.id);
    else if (effective.kind === "worktree") await api.factory.worktreeAgentStart(project, effective.worktree.path);
  };
  const messageAgent = async (text: string) => {
    if (effective.kind === "taskForce") await api.factory.agentMessage(project, effective.taskForce.id, text);
    else if (effective.kind === "worktree")
      await api.factory.worktreeAgentMessage(project, effective.worktree.path, text);
  };
  const stopAgent = async () => {
    if (effective.kind === "taskForce") await api.factory.agentStop(project, effective.taskForce.id);
    else if (effective.kind === "worktree") await api.factory.worktreeAgentStop(project, effective.worktree.path);
  };
  const backfillAgent = async () => {
    if (effective.kind === "taskForce") return api.factory.getAgent(project, effective.taskForce.id);
    if (effective.kind === "worktree") return api.factory.getWorktreeAgent(project, effective.worktree.path);
    return { agent: null, events: [] };
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-6 py-4 text-sm">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">
          <span className="truncate">{project}</span>
          <ChevronRight className="size-3 shrink-0" />
          <span className="truncate font-medium text-foreground">{targetTitle(effective)}</span>
        </nav>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left pane: agent chat */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-border">
          {effective.kind === "branch" && (
            <div className="flex items-center gap-3 border-b border-border bg-accent/30 px-4 py-3">
              <p className="flex-1 text-sm text-muted-foreground">No worktree yet for this branch.</p>
              <Button size="sm" disabled={creating} onClick={startSession}>
                <Play className="size-3.5" /> {creating ? "Starting…" : "Start a session"}
              </Button>
            </div>
          )}
          <AgentChat
            project={project}
            agentKey={agentKey}
            canChat={effective.kind !== "branch"}
            onStart={startAgent}
            onMessage={messageAgent}
            onStop={stopAgent}
            onBackfill={backfillAgent}
          />
        </div>

        {/* Right pane: details */}
        <div className="w-[360px] shrink-0">
          <WorktreeDetails
            project={project}
            entry={entry}
            server={server}
            url={url}
            busy={serverBusy}
            onStartServer={startServer}
            onStopServer={stopServer}
            onRefreshServer={refreshServer}
            linearWorkspace={linearWorkspace}
          />
        </div>
      </div>
    </>
  );
}
