import { useEffect, useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderGit2, X, Download, ArrowUpCircle, ChevronLeft } from "lucide-react";
import {
  api,
  wsUrl,
  type RunningServer,
  type InboxEntry,
  type NotificationSettings,
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
import { ProjectMenu } from "./components/ProjectMenu.tsx";
import { ProjectView } from "./components/ProjectView.tsx";
import { Cockpit, type CockpitTarget } from "./components/Cockpit.tsx";
import { InboxView } from "./components/InboxView.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";
import { buildProjectEntities, type ProjectEntity } from "./lib/projectEntities.ts";
import { useProjects, useFactory, useBranches, useWorktrees, useInbox, qk } from "./queries.ts";

// Two-rail shell (Slack-style): GlobalRail (Inbox/Settings/Theme, always visible) + ProjectMenu
// (switcher + Features/Worktrees/Branches, visible once a project is selected) + a main area
// whose content depends on `view`: "project" is the Features-only ProjectView home, "cockpit"
// renders the unified Cockpit (task force / worktree / bare branch — see CockpitTarget below),
// "inbox" renders InboxView, "settings" renders SettingsPage. Replaces the old single shadcn
// Sidebar shell + top-center search bar + Branches-tab-in-ProjectView design.
type View = "project" | "settings" | "cockpit" | "inbox";
type Theme = "light" | "dark";

/** Which cockpit target to show, addressed by stable ids/paths/names rather than the resolved
 * objects themselves — the objects are looked up from the live queries on every render (see
 * `resolvedTarget` below) so the cockpit always reflects the latest feature/worktree/branch
 * data without App having to keep its own copy in sync. */
type CockpitTargetRef =
  | { kind: "taskForce"; featureId: string; taskForceId: string }
  | { kind: "worktree"; worktreePath: string }
  | { kind: "branch"; branch: string };

/** Stable per-target remount key for `<Cockpit key=...>` — a new target (even the same kind)
 * should always tear down and remount the chat/details panes rather than reusing state. */
function cockpitTargetRefKey(t: CockpitTargetRef): string {
  if (t.kind === "taskForce") return `tf:${t.featureId}:${t.taskForceId}`;
  if (t.kind === "worktree") return `wt:${t.worktreePath}`;
  return `br:${t.branch}`;
}

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
  const { ingest, unread, agentFor, version } = useAgentStream();
  const { data: projects = [] } = useProjects();
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("project");
  const [cockpitTarget, setCockpitTarget] = useState<CockpitTargetRef | null>(null);
  const [linearWorkspace, setLinearWorkspace] = useState("");
  const [notifications, setNotifications] = useState<NotificationSettings>({ enabled: false, events: [] });

  // ⌘K palette + "force this feature open" (sidebar/palette "open feature" routing into the
  // Features-only ProjectView home).
  const [commandOpen, setCommandOpen] = useState(false);
  const [expandFeatureId, setExpandFeatureId] = useState<string | null>(null);

  const [servers, setServers] = useState<Record<string, RunningServer>>({});
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
          const map: Record<string, RunningServer> = {};
          for (const s of msg.servers as RunningServer[]) map[s.projectName] = s;
          setServers(map);
        } else if (msg.type === "status") {
          const s = msg.server as RunningServer | null;
          setServers((prev) => {
            const next = { ...prev };
            if (s) next[msg.projectName] = s;
            return next;
          });
          // Surface an abnormal exit so failures aren't silent. A clean stop
          // kills via signal (exitCode null), so this only fires on real crashes
          // (e.g. "command not found", a dev server that errored out).
          if (s && (s.status === "error" || (s.status === "exited" && !!s.exitCode))) {
            toast.error(
              `${msg.projectName}: dev server exited (code ${s.exitCode ?? "error"}). Open the cockpit's Dev server card for details.`,
              { duration: 8000 },
            );
          }
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
    setSelected(name);
    setView("project");
    setCockpitTarget(null);
    setExpandFeatureId(null);
  };

  const openTaskForce = useCallback((featureId: string, taskForceId: string) => {
    setCockpitTarget({ kind: "taskForce", featureId, taskForceId });
    setView("cockpit");
  }, []);

  const openWorktreePath = useCallback((worktreePath: string) => {
    setCockpitTarget({ kind: "worktree", worktreePath });
    setView("cockpit");
  }, []);

  // Global attention inbox — jump straight into a task force's cockpit from any project,
  // without going through the project menu's drill-down.
  const inboxQuery = useInbox();

  // Desktop notifications: reuse the inbox's project::taskForceId → name mapping for
  // notification titles (falls back to the raw key for statuses the inbox doesn't list,
  // e.g. "done"). The hook itself no-ops outside Tauri and respects config.factory.notifications.
  const taskForceNameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of inboxQuery.data ?? []) m.set(`${e.project}::${e.taskForceId}`, e.taskForceName);
    return m;
  }, [inboxQuery.data]);
  const nameForKey = useCallback((key: string) => taskForceNameByKey.get(key), [taskForceNameByKey]);
  useAgentNotifications(notifications, nameForKey);
  const openInboxEntry = (entry: InboxEntry) => {
    setSelected(entry.project);
    openTaskForce(entry.featureId, entry.taskForceId);
  };

  const selectedProject = projects.find((p) => p.name === selected) ?? null;

  // Project-scoped queries feeding both the ProjectMenu's Features/Worktrees/Branches lists and
  // the cockpit target resolution below — branches/worktrees work even in the browser reference
  // server (not isTauri-gated); useFactory is, so features/taskForces are simply empty there.
  const factoryQuery = useFactory(selected ?? "");
  const branchesQuery = useBranches(selected ?? "");
  const worktreesQuery = useWorktrees(selected ?? "");

  const openBranchByName = useCallback(
    (branchName: string) => {
      const wt = (worktreesQuery.data ?? []).find((w) => w.branch === branchName);
      if (wt) openWorktreePath(wt.path);
      else {
        setCockpitTarget({ kind: "branch", branch: branchName });
        setView("cockpit");
      }
    },
    [worktreesQuery.data, openWorktreePath],
  );

  const openWorktreeEntity = useCallback(
    (entity: ProjectEntity) => {
      if (entity.worktreePath) openWorktreePath(entity.worktreePath);
    },
    [openWorktreePath],
  );

  const openFeatureHome = useCallback((featureId: string) => {
    setExpandFeatureId(featureId);
    setCockpitTarget(null);
    setView("project");
  }, []);

  // Resolve the current cockpit target's live objects (feature/task-force, worktree, or branch)
  // from the same queries the ProjectMenu's lists use, rather than fetching separately or caching
  // a stale copy on App's own state.
  const resolvedTarget: CockpitTarget | null = useMemo(() => {
    if (!cockpitTarget) return null;
    if (cockpitTarget.kind === "taskForce") {
      const feature = factoryQuery.data?.features.find((f) => f.id === cockpitTarget.featureId);
      const taskForce = feature?.taskForces.find((t) => t.id === cockpitTarget.taskForceId);
      if (!feature || !taskForce) return null;
      return { kind: "taskForce", feature, taskForce };
    }
    if (cockpitTarget.kind === "worktree") {
      const worktree = worktreesQuery.data?.find((w) => w.path === cockpitTarget.worktreePath);
      if (!worktree) return null;
      return { kind: "worktree", worktree };
    }
    const branch = branchesQuery.data?.find((b) => b.name === cockpitTarget.branch);
    if (!branch) return null;
    return { kind: "branch", branch };
  }, [cockpitTarget, factoryQuery.data, worktreesQuery.data, branchesQuery.data]);

  const workingTaskForceIds = useMemo(() => {
    const set = new Set<string>();
    if (!selected) return set;
    for (const feature of factoryQuery.data?.features ?? []) {
      for (const tf of feature.taskForces) {
        if (agentFor(`${selected}::${tf.id}`).status === "working") set.add(tf.id);
      }
    }
    return set;
    // `version` bumps on every agent-stream ingest — agentFor itself is a stable callback that
    // reads a live ref, so without this the working set would never refresh as statuses change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factoryQuery.data, selected, agentFor, version]);

  const projectEntities = useMemo(
    () =>
      buildProjectEntities({
        features: factoryQuery.data?.features ?? [],
        branches: branchesQuery.data ?? [],
        worktrees: worktreesQuery.data ?? [],
        workingTaskForceIds,
      }),
    [factoryQuery.data, branchesQuery.data, worktreesQuery.data, workingTaskForceIds],
  );

  const unreadForFeature = useCallback(
    (featureId: string) => {
      if (!selected) return 0;
      const feature = factoryQuery.data?.features.find((f) => f.id === featureId);
      if (!feature) return 0;
      return feature.taskForces.reduce((sum, tf) => sum + unread(`${selected}::${tf.id}`), 0);
    },
    [factoryQuery.data, selected, unread],
  );

  // "View all" (a group has more than the sidebar's top-10) opens the unbounded ⌘K search
  // instead of a dedicated list view — there's no more per-kind tab to land on.
  const viewAll = useCallback(() => setCommandOpen(true), []);

  const selectEntity = useCallback(
    (entity: ProjectEntity) => {
      switch (entity.kind) {
        case "feature":
          openFeatureHome(entity.featureId ?? entity.id);
          break;
        case "taskForce":
          if (entity.featureId && entity.taskForceId) openTaskForce(entity.featureId, entity.taskForceId);
          break;
        case "branch":
          openBranchByName(entity.label);
          break;
        case "worktree":
          if (entity.taskForceId && entity.featureId) openTaskForce(entity.featureId, entity.taskForceId);
          else if (entity.worktreePath) openWorktreePath(entity.worktreePath);
          break;
      }
      setCommandOpen(false);
    },
    [openFeatureHome, openTaskForce, openBranchByName, openWorktreePath],
  );

  // Fetches all remotes for the selected project and invalidates branches/worktrees — the same
  // action the old Branches & worktrees tab's "Fetch" button triggered, now surfaced in the
  // ProjectMenu (SidebarRecent's Worktrees group header) since that tab is retired.
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

  const railActive = view === "inbox" ? "inbox" : view === "settings" ? "settings" : null;

  return (
    <div className="flex h-screen overflow-hidden">
      <GlobalRail
        inboxCount={isTauri ? inboxQuery.data?.length ?? 0 : 0}
        active={railActive}
        onInbox={() => isTauri && setView("inbox")}
        onSettings={() => setView("settings")}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <ProjectMenu
        projects={projects}
        selected={selected}
        onSelectProject={selectProject}
        servers={servers}
        onRescan={refreshProjects}
        entities={{
          features: projectEntities.features,
          taskForces: projectEntities.taskForces,
          branches: projectEntities.branches,
          worktrees: projectEntities.worktrees,
        }}
        unreadFor={unreadForFeature}
        onOpenFeature={openFeatureHome}
        onOpenTaskForce={openTaskForce}
        onOpenBranch={openBranchByName}
        onOpenWorktree={openWorktreeEntity}
        onViewAll={viewAll}
        onFetch={fetchRemote}
      />

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
        ) : !selectedProject ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <FolderGit2 className="size-10 opacity-40" />
            <div>Select a project to get started</div>
          </div>
        ) : view === "cockpit" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
              <button
                type="button"
                onClick={() => setView("project")}
                aria-label="Back to project"
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ChevronLeft className="size-3.5" />
                Back
              </button>
            </div>
            {resolvedTarget ? (
              <Cockpit
                key={cockpitTargetRefKey(cockpitTarget!)}
                project={selectedProject.name}
                target={resolvedTarget}
                onStarted={(wt) => setCockpitTarget({ kind: "worktree", worktreePath: wt.path })}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            )}
          </div>
        ) : (
          <ProjectView
            project={selectedProject}
            onOpenTaskForce={openTaskForce}
            expandFeatureId={expandFeatureId}
          />
        )}
      </div>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        entities={{
          features: projectEntities.features,
          taskForces: projectEntities.taskForces,
          branches: projectEntities.branches,
          worktrees: projectEntities.worktrees,
        }}
        onSelect={selectEntity}
      />

      <Toaster theme={theme} position="bottom-right" richColors closeButton />
    </div>
  );
}
