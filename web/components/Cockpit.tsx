import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Play } from "lucide-react";
import { api, type RunningServer, type LogLine } from "../api.ts";
import { useBranches, useWorktrees, useFactory, qk } from "../queries.ts";
import { branchKey } from "../lib/agentKey.ts";
import { type Entry, branchToEntry, worktreeToEntry } from "../lib/entries.ts";
import { AgentChat } from "./AgentChat.tsx";
import { WorktreeDetails } from "./WorktreeDetails.tsx";
import { Button } from "@/components/ui/button";
import { isTauri } from "../lib/version.ts";

/** Find the first localhost URL a dev server printed, so it can be opened. */
function findServerUrl(logs: LogLine[]): string | null {
  const re = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+(?:\/\S*)?/;
  for (const l of logs) {
    const m = l.text.match(re);
    if (m) return m[0].replace(/0\.0\.0\.0/, "localhost");
  }
  return null;
}

/**
 * The unified cockpit for a single branch — chat (left) + details (right) once it has a working
 * copy, or a "Start working" empty state when it doesn't. Replaces the old task-force/worktree/
 * bare-branch `CockpitTarget` union: every branch, filed or not, opens here.
 *
 * `hasWorktree` (whether a git worktree or a persisted `factory.branchState[branch].worktreePath`
 * exists) gates which of the two is shown. "Start working" calls `api.factory.agentStart` — which
 * creates the working copy server-side if missing, then starts the agent — and invalidates the
 * factory + worktrees queries so this re-resolves as live on the next render.
 */
export function Cockpit({
  project,
  branch,
  logs = [],
}: {
  project: string;
  branch: string;
  /** Dev-server output for this project (App owns the WS "log"-frame capture and history
   * backfill; see `App.tsx`'s `logs` state) — rendered in `WorktreeDetails`' Logs card. */
  logs?: LogLine[];
}) {
  const queryClient = useQueryClient();
  const branches = useBranches(project).data ?? [];
  const worktrees = useWorktrees(project).data ?? [];
  const factory = useFactory(project).data;

  const branchMeta = useMemo(() => branches.find((b) => b.name === branch), [branches, branch]);
  const worktree = useMemo(() => worktrees.find((w) => w.branch === branch), [worktrees, branch]);
  const branchState = factory?.branchState[branch];
  const worktreePath = worktree?.path ?? branchState?.worktreePath;
  const hasWorktree = !!worktreePath;

  const entry: Entry = useMemo(() => {
    if (worktree) return worktreeToEntry(worktree, branchMeta, null);
    return branchToEntry(
      branchMeta ?? {
        name: branch,
        current: false,
        upstream: null,
        lastCommit: null,
        lastCommitDate: null,
        lastCommitTs: null,
        author: null,
        ahead: 0,
        behind: 0,
        remoteOnly: false,
      },
      worktreePath ?? null,
      false,
    );
  }, [worktree, branchMeta, branch, worktreePath]);

  const agentKey = branchKey(project, branch);

  const [linearWorkspace, setLinearWorkspace] = useState("");
  useEffect(() => {
    if (!isTauri) return;
    api
      .getConfig()
      .then((c) => setLinearWorkspace(c.linearWorkspace))
      .catch(() => {});
  }, []);

  // Dev server — scoped to this branch's working-copy cwd.
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

  const [starting, setStarting] = useState(false);
  const startWorking = async () => {
    setStarting(true);
    try {
      await api.factory.agentStart(project, branch);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["factory", project] }),
        queryClient.invalidateQueries({ queryKey: qk.worktrees(project) }),
      ]);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setStarting(false);
    }
  };

  const startAgent = () => api.factory.agentStart(project, branch);
  const messageAgent = (text: string) => api.factory.agentMessage(project, branch, text);
  const stopAgent = () => api.factory.agentStop(project, branch);
  const backfillAgent = () => api.factory.getAgent(project, branch);

  if (!hasWorktree) {
    return (
      <>
        <div className="flex items-center gap-2 border-b border-border px-6 py-4 text-sm">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">
            <span className="truncate">{project}</span>
            <ChevronRight className="size-3 shrink-0" />
            <span className="truncate font-mono font-medium text-foreground">{branch}</span>
          </nav>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <p>No working copy yet for this branch.</p>
          <Button disabled={starting} onClick={startWorking}>
            <Play className="size-3.5" /> {starting ? "Starting…" : "Start working"}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-6 py-4 text-sm">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">
          <span className="truncate">{project}</span>
          <ChevronRight className="size-3 shrink-0" />
          <span className="truncate font-mono font-medium text-foreground">{branch}</span>
        </nav>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left pane: agent chat */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-border">
          <AgentChat
            project={project}
            agentKey={agentKey}
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
            logs={logs}
          />
        </div>
      </div>
    </>
  );
}
