import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isTauri } from "../lib/version.ts";

/** The right-pane views selectable from the cockpit header's tabs. */
type RightTab = "details" | "environment" | "logs";

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
function CockpitHeader({ branch, onBack, right }: { branch: string; onBack: () => void; right?: ReactNode }) {
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
      {right && <div className="ml-auto shrink-0">{right}</div>}
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
  // Whether to seed the new worktree with the project's node_modules/.env (see server-side
  // copy_session_extras). Default on — the common case is "just run it" — but opt-out-able for a
  // branch whose deps differ from main (copy would be stale; use "Install deps" instead).
  const [copyNodeModules, setCopyNodeModules] = useState(true);
  const [copyEnv, setCopyEnv] = useState(true);
  const startWorking = async () => {
    setStarting(true);
    try {
      await api.factory.agentStart(project, branch, { copyNodeModules, copyEnv });
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

  // Which right-pane view the header tabs show. "logs" is dev-server-only, so it's Tauri-gated
  // alongside the rest of the server UI (the browser build has no processes).
  const [rightTab, setRightTab] = useState<RightTab>("details");

  if (!hasWorktree) {
    return (
      <>
        <CockpitHeader branch={branch} onBack={onBack} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-sm text-muted-foreground">
          <p>No working copy yet for this branch.</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={copyNodeModules}
                onChange={(e) => setCopyNodeModules(e.target.checked)}
                disabled={starting}
              />
              Copy <span className="font-mono">node_modules</span> from main
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={copyEnv}
                onChange={(e) => setCopyEnv(e.target.checked)}
                disabled={starting}
              />
              Copy <span className="font-mono">.env</span> from main
            </label>
          </div>
          <Button disabled={starting} onClick={startWorking}>
            <Play className="size-3.5" /> {starting ? "Starting…" : "Start working"}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <CockpitHeader
        branch={branch}
        onBack={onBack}
        right={
          <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as RightTab)}>
            <TabsList variant="line" className="h-8">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="environment">Environment</TabsTrigger>
              {isTauri && <TabsTrigger value="logs">Logs</TabsTrigger>}
            </TabsList>
          </Tabs>
        }
      />

      {/* Resizable split: agent chat (left) + the tab-selected detail view (right). `autoSaveId`
          persists the user's drag across sessions (react-resizable-panels writes to localStorage). */}
      <ResizablePanelGroup direction="horizontal" autoSaveId="cockpit-split" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={62} minSize={35}>
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            <AgentChat
              project={project}
              agentKey={agentKey}
              onStart={startAgent}
              onMessage={messageAgent}
              onStop={stopAgent}
              onBackfill={backfillAgent}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={38} minSize={22}>
          <div className="flex h-full min-h-0 flex-col">
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
              view={rightTab}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
}
