import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, Play } from "lucide-react";
import { api, type RunningServer, type LogLine, type StoredImage } from "../api.ts";
import { useBranches, useWorktrees, useFactory, useFiles, useDeps, useGitlabHosts, qk } from "../queries.ts";
import { branchKey } from "../lib/agentKey.ts";
import { type Entry, branchToEntry, worktreeToEntry } from "../lib/entries.ts";
import { findServerUrl } from "../lib/serverUrl.ts";
import { markIntentionalStop } from "../lib/serverStopIntent.ts";
import { AgentChat } from "./AgentChat.tsx";
import { WorktreeDetails } from "./WorktreeDetails.tsx";
import { Button } from "@/components/ui/button";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isTauri } from "../lib/version.ts";

/** The right-pane views selectable from the cockpit header's tabs. */
type RightTab = "details" | "diff" | "environment" | "integrations" | "logs";

/** Poll until the dev server at `cwd` has actually exited (or vanished), so its port is released
 * before we bind it from another branch. Bounded so a stuck process can't hang the swap; a small
 * grace after it clears gives the OS time to free the socket. */
async function waitForServerStopped(project: string, cwd: string, timeoutMs = 6000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const s = await api.getServer(project, cwd);
      if (!s || (s.status !== "running" && s.status !== "starting")) break;
    } catch {
      break; // treat an errored poll as "gone" rather than blocking the swap
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  await new Promise((r) => setTimeout(r, 400));
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
function CockpitHeader({
  branch,
  title,
  onBack,
  right,
}: {
  branch: string;
  /** Friendly display title for this branch, if the user set one — shown as the header title
   * with the raw git branch name demoted to a muted secondary line. */
  title?: string;
  onBack: () => void;
  right?: ReactNode;
}) {
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
      {title && title !== branch ? (
        <div className="flex min-w-0 flex-col overflow-hidden" title={branch}>
          <span className="truncate font-medium text-foreground">{title}</span>
          <span className="truncate font-mono text-[11px] leading-tight text-muted-foreground">{branch}</span>
        </div>
      ) : (
        <span className="min-w-0 truncate font-mono font-medium text-foreground">{branch}</span>
      )}
      {right && <div className="ml-auto shrink-0">{right}</div>}
    </div>
  );
}

export function Cockpit({
  project,
  branch,
  servers = {},
  logs = {},
  onSeedLogs,
  onBack,
  initialMessage,
  initialImages,
}: {
  project: string;
  branch: string;
  /** First message from the New-session flow (already sent server-side) — passed to AgentChat so
   * it seeds the opening "You" bubble. Only set right after creating this branch's session. */
  initialMessage?: string;
  /** Data-URL images that went with the New-session first message — passed to AgentChat so the
   * opening "You" bubble shows their thumbnails. */
  initialImages?: string[];
  /** Live dev-server map keyed by working-copy `cwd` (owned by `App`, kept live via the WS
   * "hello"/status frames). Used to detect a dev server already running on a DIFFERENT branch of
   * this same project — only one branch can hold the project's port at a time, so this cockpit
   * offers to "replace" it (stop there, start here). */
  servers?: Record<string, RunningServer>;
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
  const [defaultPermissionMode, setDefaultPermissionMode] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!isTauri) return;
    api
      .getConfig()
      .then((c) => {
        setLinearWorkspace(c.linearWorkspace);
        setDefaultPermissionMode(c.factory?.permissionMode);
      })
      .catch(() => {});
  }, []);

  // Dev server — scoped to this branch's working-copy cwd.
  const [server, setServer] = useState<RunningServer | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [serverBusy, setServerBusy] = useState(false);
  const cwd = entry.cwd;

  // File list for the composer's @-file mention typeahead — scoped to this branch's working copy.
  const files = useFiles(project, cwd ?? undefined).data?.files ?? [];

  // Dependency presence for this working copy — gates the dev-server Start guard. `depsMissing` is
  // true ONLY for a Node project (has package.json) whose node_modules isn't there yet — e.g. right
  // after "New session" while the background copy is still running, or when the user opted out of
  // copying. useDeps keeps polling while node_modules is absent, so Start re-enables automatically
  // once the copy (or "Install deps") lands it.
  const deps = useDeps(project, cwd ?? undefined).data;
  const depsMissing = !!deps && deps.hasPackageJson && !deps.hasNodeModules;

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
    // Belt-and-suspenders guard (the Start button is also disabled): a Node project with no
    // node_modules would launch a dev server that fails confusingly, so block it here too.
    if (depsMissing) {
      toast.error("Install dependencies first — node_modules is missing for this branch.");
      return;
    }
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
      markIntentionalStop(cwd); // this exit is expected — App suppresses its "crashed" toast
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

  // Dev servers running on OTHER working copies of this same project (a different branch/worktree,
  // i.e. a different cwd). Since a project's dev server holds one port, only one branch can run it
  // at a time — so we surface these to offer a "replace" (stop there, start here) action.
  const otherRunningServers = useMemo(
    () =>
      Object.values(servers).filter(
        (s) =>
          s.projectName === project &&
          s.cwd !== cwd &&
          (s.status === "running" || s.status === "starting"),
      ),
    [servers, project, cwd],
  );

  // Replace: stop the dev server on another branch (`otherCwd`), WAIT for it to actually exit so
  // its port is freed, then start one here. Without the wait the new server races the old one for
  // the port and fails to bind (spamming crash toasts); `markIntentionalStop` silences the old
  // server's own expected-exit toast. Mirrors the plain `startServer` (same cwd/branch) otherwise.
  const replaceServer = async (otherCwd: string) => {
    if (!cwd) return;
    // Same dep guard as startServer — taking over the port still starts a server here, which needs
    // deps.
    if (depsMissing) {
      toast.error("Install dependencies first — node_modules is missing for this branch.");
      return;
    }
    setServerBusy(true);
    try {
      markIntentionalStop(otherCwd);
      await api.stopServer(project, otherCwd);
      await waitForServerStopped(project, otherCwd);
      const s = await api.startServer(project, { cwd, branch: entry.branchName });
      setServer(s);
      await refreshServer();
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

  const startAgent = (opts?: { model?: string; permissionMode?: string }) =>
    api.factory.agentStart(project, branch, { model: opts?.model, permissionMode: opts?.permissionMode });
  const messageAgent = (text: string, images?: { mediaType: string; data: string }[]) =>
    api.factory.agentMessage(project, branch, text, images);
  const stopAgent = () => api.factory.agentStop(project, branch);
  // EDIT / RETRY: fork the session at `messageUuid` (or fresh, when null) and re-run with `text`.
  // `opts` carries the composer's per-session model/permission overrides so the fork relaunches
  // with the same settings as a normal start.
  const editMessage = (
    messageUuid: string | null,
    text: string,
    images?: { mediaType: string; data: string }[],
    opts?: { model?: string; permissionMode?: string },
  ) => api.factory.agentFork(project, branch, { messageUuid, text, images, ...opts });
  // RESET: forget the session, start a brand-new conversation.
  const resetAgent = (opts?: { model?: string; permissionMode?: string }) =>
    api.factory.agentReset(project, branch, opts ?? {});
  const backfillAgent = () => api.factory.getAgent(project, branch);
  const resolveApproval = (approvalId: string, decision: "allow" | "deny", reason?: string) =>
    api.factory.resolveApproval(project, branch, approvalId, decision, reason);
  // Composer draft + follow-up queue live server-side, so an unsent message and anything parked
  // while the agent was busy survive a reload/restart — and the server delivers the queue itself.
  const loadDraft = () => api.factory.agentDraftGet(project, branch);
  const saveDraft = (text: string, images: StoredImage[]) =>
    api.factory.agentDraftSave(project, branch, text, images);
  const listQueue = () => api.factory.agentQueueList(project, branch).then((r) => r.queued);
  const addQueued = (text: string, images: StoredImage[]) =>
    api.factory.agentQueueAdd(project, branch, text, images);
  const removeQueued = (id: string) => api.factory.agentQueueRemove(project, id);

  // Which right-pane view the header tabs show. "logs" is dev-server-only, so it's Tauri-gated
  // alongside the rest of the server UI (the browser build has no processes).
  const [rightTab, setRightTab] = useState<RightTab>("details");

  // Integrations-tab visibility is driven by CHEAP, app-level config signals — never by the heavy
  // per-branch GitLab overview (that stays lazy, firing only once the tab is open). Linear counts
  // when a workspace is configured; GitLab counts when any host is set up app-wide (the tab's own
  // card still shows a "not connected" hint if this specific project isn't wired).
  const gitlabConfigured = (useGitlabHosts().data?.hosts.length ?? 0) > 0;
  const hasIntegrations = !!linearWorkspace || gitlabConfigured;
  // Safety: if the Integrations tab vanishes (config changed) while it's selected, don't strand the
  // pane on a hidden tab — fall back to Details.
  useEffect(() => {
    if (!hasIntegrations && rightTab === "integrations") setRightTab("details");
  }, [hasIntegrations, rightTab]);

  if (!hasWorktree) {
    return (
      <>
        <CockpitHeader branch={branch} title={branchState?.title?.trim() || undefined} onBack={onBack} />
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
        title={branchState?.title?.trim() || undefined}
        onBack={onBack}
        right={
          <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as RightTab)}>
            <TabsList variant="line" className="h-8">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="diff">Diff</TabsTrigger>
              <TabsTrigger value="environment">Environment</TabsTrigger>
              {hasIntegrations && <TabsTrigger value="integrations">Integrations</TabsTrigger>}
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
              files={files}
              initialMessage={initialMessage}
              initialImages={initialImages}
              defaultPermissionMode={defaultPermissionMode}
              onStart={startAgent}
              onMessage={messageAgent}
              onStop={stopAgent}
              onEditMessage={editMessage}
              onReset={resetAgent}
              onBackfill={backfillAgent}
              onResolveApproval={resolveApproval}
              onDraftLoad={loadDraft}
              onDraftSave={saveDraft}
              onQueueList={listQueue}
              onQueueAdd={addQueued}
              onQueueRemove={removeQueued}
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
              depsMissing={depsMissing}
              otherRunningServers={otherRunningServers}
              onReplaceServer={replaceServer}
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
