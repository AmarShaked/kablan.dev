import { useEffect, useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderGit2, X, Download, ArrowUpCircle } from "lucide-react";
import {
  api,
  wsUrl,
  type RunningServer,
  type InboxEntry,
  type NotificationSettings,
  type LogLine,
} from "./api.ts";
import { AgentStreamProvider, useAgentStream } from "./hooks/useAgentStream.tsx";
import { useAgentNotifications } from "./hooks/useAgentNotifications.tsx";
import {
  APP_VERSION,
  checkForUpdate,
  checkTauriUpdate,
  isTauri,
  DOWNLOAD_URL,
  type UpdateInfo,
  type TauriUpdate,
} from "./lib/version.ts";
import { Toaster } from "@/components/ui/sonner";
import { SettingsPage } from "./components/SettingsPage.tsx";
import { GlobalRail } from "./components/GlobalRail.tsx";
import { TitleBar } from "./components/TitleBar.tsx";
import { ProjectMenu } from "./components/ProjectMenu.tsx";
import { ProjectView } from "./components/ProjectView.tsx";
import { Cockpit } from "./components/Cockpit.tsx";
import { InboxView } from "./components/InboxView.tsx";
import { HomeView } from "./components/HomeView.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";
import { NewSessionDialog } from "./components/NewSessionDialog.tsx";
import { buildBranchEntities } from "./lib/projectEntities.ts";
import { branchKey } from "./lib/agentKey.ts";
import { pickDefaultProject } from "./lib/pickDefaultProject.ts";
import { useProjects, useFactory, useBranches, useWorktrees, useInbox, qk } from "./queries.ts";

/** localStorage key for the most-recently-selected project name — read on startup to restore the
 * user's last project (see `pickDefaultProject`), written on every manual selection. */
const LAST_PROJECT_KEY = "kablan.lastProject";

// Two-rail shell (Slack-style): GlobalRail (Inbox/Settings/Theme, always visible) + ProjectMenu
// (switcher + Feature folders/Branches, visible once a project is selected) + a main area whose
// content depends on `view`: "project" is the Features-roster ProjectView home, "cockpit" renders
// the unified branch Cockpit, "inbox" renders InboxView, "settings" renders SettingsPage. Every
// branch — filed into a feature or not — opens the same cockpit; there's no separate
// task-force/worktree/bare-branch target kind anymore (see `cockpitBranch` below).
type View = "project" | "settings" | "cockpit" | "inbox" | "home";
type Theme = "light" | "dark";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const s = localStorage.getItem("theme");
    return s === "light" || s === "dark" ? s : "dark";
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

export function App() {
  return (
    <AgentStreamProvider>
      <AppContent />
    </AgentStreamProvider>
  );
}

function AppContent() {
  const [theme, toggleTheme] = useTheme();
  const queryClient = useQueryClient();
  const { ingest, agentFor, version: agentStreamVersion, snapshotStatuses } = useAgentStream();
  const { data: projects = [] } = useProjects();
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [cockpitBranch, setCockpitBranch] = useState<string | null>(null);
  const [linearWorkspace, setLinearWorkspace] = useState("");
  const [notifications, setNotifications] = useState<NotificationSettings>({ enabled: false, events: [] });

  const [commandOpen, setCommandOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);

  // Dev servers keyed by working-copy `cwd` (globally unique) — multiple working copies of the
  // same project can run at once. Fed by the WS hello/status frames below.
  const [servers, setServers] = useState<Record<string, RunningServer>>({});
  // Dev-server output, keyed by working-copy `cwd` — fed by the WS "log" frames below and seeded
  // per-cwd from `api.getLogs` when a cockpit opens. Threaded into the cockpit's Dev server area.
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({});
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [tauriUpdate, setTauriUpdate] = useState<TauriUpdate | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  useEffect(() => {
    // In the desktop app, self-update in place; in the browser, link to the download.
    if (isTauri) checkTauriUpdate().then(setTauriUpdate).catch(() => {});
    else checkForUpdate().then(setUpdate);
  }, []);

  // Version available via either path (Tauri updater or web release check).
  const newVersion = tauriUpdate?.version ?? update?.latest ?? null;
  const runTauriUpdate = async () => {
    if (!tauriUpdate) return;
    setUpdating(true);
    try {
      toast.info("Downloading update…");
      await tauriUpdate.run(); // installs + relaunches
    } catch (err) {
      toast.error(`Update failed: ${String(err)}`);
      setUpdating(false);
    }
  };

  const refreshProjects = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.projects }),
    [queryClient],
  );

  // Seeds `logs[cwd]` with whatever the dev-server process at that working copy has already
  // emitted (e.g. a server started before its cockpit was opened) — the WS "log" handler below
  // only appends going forward, it can't backfill history for a session it wasn't open for.
  // Called by the Cockpit once it knows its branch's working-copy cwd.
  const seedLogs = useCallback((cwd: string, lines: LogLine[]) => {
    setLogs((prev) => ({ ...prev, [cwd]: lines }));
  }, []);

  useEffect(() => {
    api.getConfig().then((c) => {
      setLinearWorkspace(c.linearWorkspace);
      setNotifications(c.factory.notifications);
    });
  }, []);

  // --- WebSocket: live status (dev servers) + agent stream ---
  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(wsUrl());
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "hello") {
          // Servers are keyed by working-copy cwd (globally unique).
          const map: Record<string, RunningServer> = {};
          for (const s of msg.servers as RunningServer[]) map[s.cwd] = s;
          setServers(map);
        } else if (msg.type === "status") {
          const s = msg.server as RunningServer | null;
          const cwd = (msg.cwd as string) ?? s?.cwd;
          setServers((prev) => {
            const next = { ...prev };
            if (s && cwd) next[cwd] = s;
            else if (cwd) delete next[cwd];
            return next;
          });
          // Surface an abnormal exit so failures aren't silent. A clean stop
          // kills via signal (exitCode null), so this only fires on real crashes
          // (e.g. "command not found", a dev server that errored out). Name the
          // working copy (branch, else the cwd's folder) so it's clear which one.
          if (s && (s.status === "error" || (s.status === "exited" && !!s.exitCode))) {
            const where = s.branch ?? s.cwd.split("/").filter(Boolean).pop() ?? s.cwd;
            toast.error(
              `${msg.projectName} · ${where}: dev server exited (code ${s.exitCode ?? "error"}). Open the cockpit's Logs card for details.`,
              { duration: 8000 },
            );
          }
        } else if (msg.type === "log") {
          const { cwd, line } = msg as { cwd: string; line: LogLine };
          setLogs((prev) => {
            const arr = prev[cwd] ? [...prev[cwd], line] : [line];
            if (arr.length > 3000) arr.splice(0, arr.length - 3000);
            return { ...prev, [cwd]: arr };
          });
        } else if (msg.type?.startsWith("agent-")) {
          ingest(msg);
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [ingest]);

  const selectProject = (name: string) => {
    localStorage.setItem(LAST_PROJECT_KEY, name);
    setSelected(name);
    setView("project");
    setCockpitBranch(null);
  };

  // Auto-select a default project once the project list first loads, so the ProjectMenu is
  // populated — but WITHOUT switching the view (the app opens on Home). Guarded on
  // `selected === null` so this only ever fires before the user (or this same effect) has made a
  // choice — it never overrides a later manual selection.
  useEffect(() => {
    if (selected !== null || projects.length === 0) return;
    const lastOpened = localStorage.getItem(LAST_PROJECT_KEY);
    const name = pickDefaultProject(projects, lastOpened);
    if (name) {
      localStorage.setItem(LAST_PROJECT_KEY, name);
      setSelected(name); // keep the current view (Home on startup); don't jump to the project view
    }
    // selectProject is redefined every render (not memoized) — reacting to `projects`/`selected`
    // is what matters here, and the `selected` guard above makes this idempotent regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, selected]);

  const openBranch = useCallback((branch: string) => {
    setCockpitBranch(branch);
    setView("cockpit");
  }, []);

  // "New session" flow's completion: the backend already created the branch/worktree and
  // started its agent (see `NewSessionDialog` → `api.factory.startSession`) — this just brings
  // the newly-created branch's data in (factory/worktrees/branches all changed server-side) and
  // opens straight into its cockpit, exactly like clicking an existing branch would.
  const handleSessionStarted = useCallback(
    (branch: string) => {
      if (!selected) return;
      queryClient.invalidateQueries({ queryKey: ["factory", selected] });
      queryClient.invalidateQueries({ queryKey: qk.worktrees(selected) });
      queryClient.invalidateQueries({ queryKey: qk.branches(selected) });
      setCockpitBranch(branch);
      setView("cockpit");
    },
    [selected, queryClient],
  );

  // Cross-project jump targets used by the Activity view — an agent row selects its project
  // then opens its branch cockpit; a server row selects the project. The cockpit seeds its own
  // per-cwd logs on open, so no project-level backfill is needed here. Mirrors `openInboxEntry`.
  const openBranchFromActivity = useCallback(
    (project: string, branch: string) => {
      setSelected(project);
      openBranch(branch);
    },
    [openBranch],
  );
  const openProjectFromActivity = useCallback((project: string) => {
    setSelected(project);
    setView("project");
    setCockpitBranch(null);
  }, []);

  // Global attention inbox — jump straight into a branch's cockpit from any project, without
  // going through the project menu's drill-down.
  const inboxQuery = useInbox();

  // Desktop notifications: reuse the inbox's project::branch → name mapping for notification
  // titles (falls back to the raw key for statuses the inbox doesn't list, e.g. "done"). The
  // hook itself no-ops outside Tauri and respects config.factory.notifications.
  const branchNameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of inboxQuery.data ?? [])
      m.set(branchKey(e.project, e.branch), e.featureName ? `${e.featureName} · ${e.branch}` : e.branch);
    return m;
  }, [inboxQuery.data]);
  const nameForKey = useCallback((key: string) => branchNameByKey.get(key), [branchNameByKey]);
  useAgentNotifications(notifications, nameForKey);
  const openInboxEntry = (entry: InboxEntry) => {
    setSelected(entry.project);
    openBranch(entry.branch);
  };

  const selectedProject = projects.find((p) => p.name === selected) ?? null;

  // Project-scoped queries feeding both the ProjectMenu's Feature folders/Branches lists and the
  // Cockpit itself — branches/worktrees work even in the browser reference server (not
  // isTauri-gated); useFactory is, so features/branchState are simply empty there.
  const factoryQuery = useFactory(selected ?? "");
  const branchesQuery = useBranches(selected ?? "");
  const worktreesQuery = useWorktrees(selected ?? "");

  const isServerRunning = useCallback(
    (cwd?: string) => {
      if (!cwd) return false;
      const s = servers[cwd];
      return !!s && (s.status === "running" || s.status === "starting");
    },
    [servers],
  );

  const statusFor = useCallback(
    (branch: string) => (selected ? agentFor(branchKey(selected, branch)).status : undefined),
    [selected, agentFor],
  );

  // Live snapshot of every agent's status, across all projects — recomputed whenever the agent
  // stream ingests something (`agentStreamVersion` bumps on every ingest), so the Activity view
  // updates as statuses change without needing its own subscription plumbing.
  const activityStatuses = useMemo(
    () => snapshotStatuses(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshotStatuses, agentStreamVersion],
  );

  const branchEntities = useMemo(
    () =>
      buildBranchEntities({
        branches: branchesQuery.data ?? [],
        worktrees: worktreesQuery.data ?? [],
        factory: factoryQuery.data ?? { features: [], branchState: {} },
        statusFor,
        isServerRunning,
      }),
    [branchesQuery.data, worktreesQuery.data, factoryQuery.data, statusFor, isServerRunning],
  );

  // Fetches all remotes for the selected project and invalidates branches/worktrees — the same
  // action the old Branches & worktrees tab's "Fetch" button triggered, now surfaced in the
  // ProjectMenu (SidebarRecent's Branches group header).
  const fetchRemote = useCallback(async () => {
    if (!selected) return;
    try {
      const res = await api.fetchRemote(selected);
      toast.success(res.output || "Fetched.", { duration: 5000 });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.branches(selected) }),
        queryClient.invalidateQueries({ queryKey: qk.worktrees(selected) }),
      ]);
    } catch (err) {
      toast.error(String(err), { duration: 8000 });
    }
  }, [selected, queryClient]);

  // Global ⌘K / Ctrl+K toggles the command palette from anywhere in the app.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const railActive =
    view === "inbox" ? "inbox" : view === "home" ? "home" : view === "settings" ? "settings" : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-sidebar">
      <TitleBar isTauri={isTauri} projectLabel={selected} onOpenSearch={() => setCommandOpen(true)} />

      {/* Slack-style shell: TitleBar + GlobalRail are the outer chrome (bg-sidebar); the sub-sidebar
          (ProjectMenu) + the main section sit together inside one rounded, bordered panel that
          floats within the shell. */}
      <div className="flex min-h-0 flex-1 overflow-hidden bg-sidebar">
        <GlobalRail
          inboxCount={isTauri ? inboxQuery.data?.length ?? 0 : 0}
          active={railActive}
          onInbox={() => isTauri && setView("inbox")}
          onHome={() => setView("home")}
          onSettings={() => setView("settings")}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <div className="m-2 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-background">
        {/* The project sub-sidebar (switcher + Features/Branches + New session) is only meaningful
            for project-scoped views. Settings and Inbox are global full-width pages, so it's hidden
            there and the main section takes the full panel width. */}
        {view !== "settings" && view !== "inbox" && (
        <ProjectMenu
          projects={projects}
          selected={selected}
          onSelectProject={selectProject}
          servers={servers}
          onRescan={refreshProjects}
          featureGroups={branchEntities.featureGroups}
          unfiled={branchEntities.unfiled}
          activeBranch={view === "cockpit" ? cockpitBranch : null}
          onOpenBranch={openBranch}
          onFetch={fetchRemote}
          featuresLoading={factoryQuery.isLoading}
          branchesLoading={branchesQuery.isLoading}
          onNewSession={selected ? () => setNewSessionOpen(true) : undefined}
        />
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {newVersion && !updateDismissed && (
            <div className="flex items-center gap-3 border-b border-[var(--success)]/30 bg-[var(--success)]/10 px-4 py-2 text-sm">
              <ArrowUpCircle className="size-4 shrink-0 text-[var(--success)]" />
              <span>
                Kablan.dev <strong>v{newVersion}</strong> is available.
              </span>
              {tauriUpdate ? (
                <button
                  onClick={runTauriUpdate}
                  disabled={updating}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--success)]/20 px-2 py-0.5 font-medium text-[var(--success)] transition-colors hover:bg-[var(--success)]/30 disabled:opacity-60"
                >
                  <Download className="size-3.5" /> {updating ? "Updating…" : "Update & restart"}
                </button>
              ) : (
                <a
                  href={DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--success)]/20 px-2 py-0.5 font-medium text-[var(--success)] transition-colors hover:bg-[var(--success)]/30"
                >
                  <Download className="size-3.5" /> Download
                </a>
              )}
              <button
                onClick={() => setUpdateDismissed(true)}
                aria-label="Dismiss"
                className="ml-auto text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          {view === "settings" ? (
            <SettingsPage
              onClose={() => setView("project")}
              onConfigChanged={async () => {
                const c = await api.getConfig();
                setLinearWorkspace(c.linearWorkspace);
                setNotifications(c.factory.notifications);
                await refreshProjects();
              }}
              projects={projects}
            />
          ) : view === "inbox" && isTauri ? (
            <InboxView onOpen={openInboxEntry} />
          ) : view === "home" ? (
            <HomeView
              statuses={activityStatuses}
              servers={servers}
              logs={logs}
              onOpenBranch={openBranchFromActivity}
              onOpenProject={openProjectFromActivity}
              onNewSession={selected ? () => setNewSessionOpen(true) : undefined}
            />
          ) : !selectedProject ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
              <FolderGit2 className="size-10 opacity-40" />
              <div>Select a project to get started</div>
            </div>
          ) : view === "cockpit" && cockpitBranch ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <Cockpit
                key={`${selectedProject.name}::${cockpitBranch}`}
                project={selectedProject.name}
                branch={cockpitBranch}
                logs={logs}
                onSeedLogs={seedLogs}
                onBack={() => setView("project")}
              />
            </div>
          ) : (
            <ProjectView project={selectedProject} />
          )}
        </div>
        </div>
      </div>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        branches={branchEntities.all}
        onSelect={(branch) => {
          openBranch(branch);
          setCommandOpen(false);
        }}
      />

      {selectedProject && (
        <NewSessionDialog
          project={selectedProject.name}
          open={newSessionOpen}
          onOpenChange={setNewSessionOpen}
          branches={branchesQuery.data ?? []}
          onStarted={handleSessionStarted}
        />
      )}

      <Toaster theme={theme} position="bottom-right" richColors closeButton />
    </div>
  );
}
