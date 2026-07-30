import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, Play } from "lucide-react";
import { api, type RunningServer, type LogLine } from "../api.ts";
import { useBranches, useWorktrees, useFactory, qk } from "../queries.ts";
import { branchKey } from "../lib/agentKey.ts";
import { type Entry, branchToEntry, worktreeToEntry } from "../lib/entries.ts";
import { findServerUrl } from "../lib/serverUrl.ts";
import { AgentChat } from "./AgentChat.tsx";
import { WorktreeDetails } from "./WorktreeDetails.tsx";
import { Button } from "@/components/ui/button";
import { isTauri } from "../lib/version.ts";

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
function CockpitHeader({ branch, onBack }: { branch: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to project"
        className="flex shrink-0 items-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-0 truncate font-mono font-medium text-foreground">{branch}</span>
    </div>
  );
}

export function Cockpit({
  project,
  branch,
  logs = {},
  onSeedLogs,
  onBack,
}: {
  project: string;
  branch: string;
  /** Back to the project view — rendered as the header's chevron. */
  onBack: () => void;
  /** Live dev-server output keyed by working-copy `cwd` (App owns the WS "log"-frame capture; see
   * `App.tsx`'s `logs` state). This cockpit renders only its own branch's cwd slice. */
  logs?: Record<string, LogLine[]>;
  /** Seeds `logs[cwd]` with the process's already-emitted history when this cockpit opens onto a
   * running server (the WS stream only appends going forward). */
  onSeedLogs?: (cwd: string, lines: LogLine[]) => void;
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
      const s = await api.getServer(project, cwd);
      setServer(s);
      if (s) {
        const lines = await api.getLogs(project, cwd);
        setUrl(findServerUrl(lines));
        // Backfill App's per-cwd log history so the Logs card shows output emitted before this
        // cockpit (and its WS stream) was open.
        onSeedLogs?.(cwd, lines);
      } else {
        setUrl(null);
      }
    } catch {
      /* no server yet */
    }
  }, [project, cwd, onSeedLogs]);

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
    if (!cwd) return;
    setServerBusy(true);
    try {
      await api.stopServer(project, cwd);
      setServer(null);
      setUrl(null);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setServerBusy(false);
    }
  };
  // Run `npm install` in this worktree — reuses the dev-server process plumbing (streams into the
  // Logs card, tracked per cwd) with an explicit command instead of the resolved dev command. Used
  // to fix up deps when a copied node_modules is stale (e.g. validating a teammate's branch).
  const installDeps = async () => {
    if (!cwd) return;
    setServerBusy(true);
    try {
      const s = await api.startServer(project, { cwd, branch: entry.branchName, command: "npm install" });
      setServer(s);
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
        <CockpitHeader branch={branch} onBack={onBack} />
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
      <CockpitHeader branch={branch} onBack={onBack} />

      <div className="flex min-h-0 flex-1">
        {/* Left pane: agent chat */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-border">
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
            onInstall={installDeps}
            onRefreshServer={refreshServer}
            linearWorkspace={linearWorkspace}
            logs={cwd ? logs[cwd] ?? [] : []}
          />
        </div>
      </div>
    </>
  );
}
