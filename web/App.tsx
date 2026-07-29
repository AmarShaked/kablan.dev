import { useEffect, useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FolderGit2,
  Settings,
  X,
  Sun,
  Moon,
  Download,
  ArrowUpCircle,
  Inbox,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import {
  api,
  wsUrl,
  type RunningServer,
  type LogLine,
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { CSSProperties } from "react";
import { SettingsPage } from "./components/SettingsPage.tsx";
import { ProjectSwitcher } from "./components/ProjectSwitcher.tsx";
import { ProjectView } from "./components/ProjectView.tsx";
import { TaskForceCockpit } from "./components/TaskForceCockpit.tsx";
import { InboxView } from "./components/InboxView.tsx";
import { SidebarRecent } from "./components/SidebarRecent.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";
import { buildProjectEntities, type ProjectEntity } from "./lib/projectEntities.ts";
import { useProjects, useFactory, useBranches, useWorktrees, useInbox, qk } from "./queries.ts";

// "cockpit" renders TaskForceCockpit (Task 5, Plan 04); "inbox" renders InboxView (Task 5,
// Plan 05) — the global cross-project attention list. "project" renders ProjectView, which
// itself hosts a Features browser (absorbing the old nested factory sidebar/FeaturePage) and
// a Branches & worktrees tab (OverviewTab) — the sidebar is single-level (no per-project nav).
type View = "project" | "settings" | "cockpit" | "inbox";
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
  const { ingest, unreadForProject, unread, agentFor, version } = useAgentStream();
  const { data: projects = [] } = useProjects();
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("project");
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [selectedTaskForceId, setSelectedTaskForceId] = useState<string | null>(null);
  const [linearWorkspace, setLinearWorkspace] = useState("");
  const [notifications, setNotifications] = useState<NotificationSettings>({ enabled: false, events: [] });

  // Agent Factory sidebar: recent Features/Worktrees/Branches lists + the ⌘K command palette,
  // both scoped to the selected project. `projectTab`/`expandFeatureId` drive ProjectView so a
  // sidebar/palette row can land on the right tab (and, for a feature, force it open).
  const [commandOpen, setCommandOpen] = useState(false);
  const [projectTab, setProjectTab] = useState<"features" | "branches">("features");
  const [expandFeatureId, setExpandFeatureId] = useState<string | null>(null);

  const [servers, setServers] = useState<Record<string, RunningServer>>({});
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

  useEffect(() => {
    api.getConfig().then((c) => {
      setLinearWorkspace(c.linearWorkspace);
      setNotifications(c.factory.notifications);
    });
  }, []);

  // --- WebSocket: live status + logs ---
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
              `${msg.projectName}: dev server exited (code ${s.exitCode ?? "error"}). Open the item's Logs tab for details.`,
              { duration: 8000 },
            );
          }
        } else if (msg.type === "log") {
          const { projectName, line } = msg;
          setLogs((prev) => {
            const arr = prev[projectName] ? [...prev[projectName], line] : [line];
            if (arr.length > 3000) arr.splice(0, arr.length - 3000);
            return { ...prev, [projectName]: arr };
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

  const loadLogsFor = useCallback(async (name: string) => {
    try {
      const existing = await api.getLogs(name);
      setLogs((prev) => ({ ...prev, [name]: existing }));
    } catch {
      /* no server yet */
    }
  }, []);

  const selectProject = (name: string) => {
    setSelected(name);
    setView("project");
    setSelectedFeatureId(null);
    setSelectedTaskForceId(null);
    loadLogsFor(name);
  };

  const openTaskForce = (featureId: string, taskForceId: string) => {
    setSelectedFeatureId(featureId);
    setSelectedTaskForceId(taskForceId);
    setView("cockpit");
  };

  // Global attention inbox — jump straight into a task force's cockpit from any project,
  // without going through the sidebar's project → factory drill-down.
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
    setSelectedFeatureId(entry.featureId);
    setSelectedTaskForceId(entry.taskForceId);
    setView("cockpit");
    loadLogsFor(entry.project);
  };

  // Resolve the selected Feature/TaskForce objects (for the cockpit's breadcrumb + content)
  // from the same factory overview the Features browser uses, rather than fetching separately.
  const factoryQuery = useFactory(selected ?? "");
  const selectedFeature = useMemo(() => {
    if (!selectedFeatureId) return null;
    return factoryQuery.data?.features.find((f) => f.id === selectedFeatureId) ?? null;
  }, [factoryQuery.data, selectedFeatureId]);
  const selectedTaskForce = useMemo(() => {
    if (!selectedTaskForceId) return null;
    for (const f of factoryQuery.data?.features ?? []) {
      const tf = f.taskForces.find((t) => t.id === selectedTaskForceId);
      if (tf) return tf;
    }
    return null;
  }, [factoryQuery.data, selectedTaskForceId]);

  const selectedProject = projects.find((p) => p.name === selected) ?? null;
  const selectedServer = selected ? servers[selected] ?? null : null;

  // Sidebar "recent 10" lists + ⌘K palette — branches/worktrees work even in the browser
  // reference server (useBranches/useWorktrees aren't isTauri-gated); useFactory is, so
  // features/taskForces are simply empty there (buildProjectEntities handles empty arrays fine).
  const branchesQuery = useBranches(selected ?? "");
  const worktreesQuery = useWorktrees(selected ?? "");

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

  const openFeature = useCallback((featureId: string) => {
    setExpandFeatureId(featureId);
    setProjectTab("features");
    setView("project");
  }, []);

  const openBranch = useCallback((_name: string) => {
    setProjectTab("branches");
    setView("project");
  }, []);

  const openWorktreeEntity = useCallback(
    (entity: ProjectEntity) => {
      if (entity.taskForceId && entity.featureId) {
        openTaskForce(entity.featureId, entity.taskForceId);
      } else {
        setProjectTab("branches");
        setView("project");
      }
    },
    // openTaskForce is redefined every render (it's not wrapped in useCallback), so it can't be
    // listed as a dep without this effectively never memoizing — it only ever reads state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const viewAll = useCallback((kind: "features" | "branches" | "worktrees") => {
    setProjectTab(kind === "features" ? "features" : "branches");
    setView("project");
  }, []);

  const selectEntity = useCallback(
    (entity: ProjectEntity) => {
      switch (entity.kind) {
        case "feature":
          openFeature(entity.featureId ?? entity.id);
          break;
        case "taskForce":
          if (entity.featureId && entity.taskForceId) openTaskForce(entity.featureId, entity.taskForceId);
          break;
        case "branch":
          openBranch(entity.label);
          break;
        case "worktree":
          openWorktreeEntity(entity);
          break;
      }
      setCommandOpen(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openFeature, openBranch, openWorktreeEntity],
  );

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

  return (
    <SidebarProvider
      className="h-screen overflow-hidden"
      style={{ "--sidebar-width": "19rem" } as CSSProperties}
    >
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-2">
          <div className="flex h-8 items-center gap-2 px-1.5">
            <span className="size-2.5 shrink-0 rounded-full bg-primary" />
            <span className="truncate font-semibold text-[15px] group-data-[collapsible=icon]:hidden">
              Kablan.dev
            </span>
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <ProjectSwitcher
              projects={projects}
              selected={selected}
              onSelect={selectProject}
              servers={servers}
              onRescan={refreshProjects}
            />
          </div>
        </SidebarHeader>

        <SidebarContent className="overflow-hidden">
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  isActive={view === "project" || view === "cockpit"}
                  tooltip="Projects"
                  onClick={() => setView("project")}
                >
                  <FolderGit2 />
                  <span>Projects</span>
                </SidebarMenuButton>
                {selected && unreadForProject(selected) > 0 && (
                  <SidebarMenuBadge>{unreadForProject(selected)}</SidebarMenuBadge>
                )}
              </SidebarMenuItem>
              {isTauri && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="sm"
                    isActive={view === "inbox"}
                    tooltip="Inbox"
                    onClick={() => setView("inbox")}
                  >
                    <Inbox />
                    <span>Inbox</span>
                  </SidebarMenuButton>
                  {(inboxQuery.data?.length ?? 0) > 0 && (
                    <SidebarMenuBadge>{inboxQuery.data!.length}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  isActive={view === "settings"}
                  tooltip="Settings"
                  onClick={() => setView("settings")}
                >
                  <Settings />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          {selected && (
            <div className="flex min-h-0 flex-1 flex-col">
              <SidebarRecent
                features={projectEntities.features}
                worktrees={projectEntities.worktrees}
                branches={projectEntities.branches}
                unreadFor={unreadForFeature}
                onOpenFeature={openFeature}
                onOpenTaskForce={openTaskForce}
                onOpenBranch={openBranch}
                onOpenWorktree={openWorktreeEntity}
                onViewAll={viewAll}
              />
            </div>
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="sm"
                tooltip={theme === "dark" ? "Switch to light" : "Switch to dark"}
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun /> : <Moon />}
                <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {newVersion && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  className="text-[var(--success)]"
                  tooltip={`Update available: v${newVersion}`}
                  disabled={updating}
                  onClick={() =>
                    tauriUpdate
                      ? runTauriUpdate()
                      : window.open(DOWNLOAD_URL, "_blank", "noopener,noreferrer")
                  }
                >
                  <ArrowUpCircle />
                  <span>{updating ? "Updating…" : `Update to v${newVersion}`}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
          <div className="px-2 pt-1 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
            Kablan.dev v{APP_VERSION}
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="h-screen overflow-hidden">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
          <SidebarTrigger />
          <div className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              aria-label="Search the project"
              className="flex w-full max-w-md items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/70"
            >
              <Search className="size-4 shrink-0" />
              <span className="truncate">Search features, task forces, branches…</span>
              <kbd className="ml-auto hidden shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium sm:inline">
                ⌘K
              </kbd>
            </button>
          </div>
          <div className="w-7 shrink-0" />
        </div>
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
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
            <FolderGit2 className="size-10 opacity-40" />
            <div>Select a project to get started</div>
          </div>
        ) : view === "cockpit" ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm">
              <button
                type="button"
                onClick={() => setView("project")}
                aria-label="Back to project"
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ChevronLeft className="size-3.5" />
                Back
              </button>
              <nav
                aria-label="Breadcrumb"
                className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground"
              >
                <span className="truncate">{selectedProject.name}</span>
                <ChevronRight className="size-3 shrink-0" />
                <span className="truncate">{selectedFeature?.name ?? "…"}</span>
                <ChevronRight className="size-3 shrink-0" />
                <span className="truncate font-medium text-foreground">
                  {selectedTaskForce?.name ?? "…"}
                </span>
              </nav>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              {selectedTaskForce ? (
                <TaskForceCockpit
                  key={`${selected}::${selectedTaskForce.id}`}
                  project={selectedProject.name}
                  taskForce={selectedTaskForce}
                />
              ) : (
                <>
                  <div className="flex items-center gap-3 border-b border-border px-6 py-4">
                    <SidebarTrigger className="shrink-0" />
                    <h1 className="text-lg font-semibold">Task force cockpit</h1>
                  </div>
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    Task force not found.
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <ProjectView
            project={selectedProject}
            server={selectedServer}
            logs={logs[selectedProject.name] ?? []}
            onCommandChange={refreshProjects}
            linearWorkspace={linearWorkspace}
            onOpenTaskForce={openTaskForce}
            tab={projectTab}
            onTabChange={setProjectTab}
            expandFeatureId={expandFeatureId}
          />
        )}
      </SidebarInset>

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
    </SidebarProvider>
  );
}
