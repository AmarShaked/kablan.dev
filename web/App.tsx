import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderGit2, RefreshCw, Settings, Search, X, Sun, Moon, Download, ArrowUpCircle, Inbox } from "lucide-react";
import {
  api,
  wsUrl,
  type ProjectSummary,
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
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cn } from "@/lib/utils";
import { ProjectIcon, iconNameFor, useProjectIcons } from "@/lib/projectIcons.tsx";
import { IconPicker } from "./components/IconPicker.tsx";
import type { CSSProperties } from "react";
import { OverviewTab } from "./components/OverviewTab.tsx";
import { SettingsPage } from "./components/SettingsPage.tsx";
import { StatusDot } from "./components/StatusDot.tsx";
import { FactorySidebar, UnreadPill, type BranchEntry } from "./components/FactorySidebar.tsx";
import { FeaturePage } from "./components/FeaturePage.tsx";
import { TaskForceCockpit } from "./components/TaskForceCockpit.tsx";
import { InboxView } from "./components/InboxView.tsx";
import { useProjects, useBranches, useWorktrees, useFactory, useInbox, qk } from "./queries.ts";

// "feature" renders FeaturePage (Task 4); "cockpit" renders TaskForceCockpit (Task 5, Plan 04);
// "inbox" renders InboxView (Task 5, Plan 05) — the global cross-project attention list.
type View = "project" | "settings" | "feature" | "cockpit" | "inbox";
type SidebarMode = "projects" | "factory";
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
  const { ingest, unreadForProject } = useAgentStream();
  const projectIcons = useProjectIcons();
  const { data: projects = [], isPending: loading } = useProjects();
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("project");
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("projects");
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [selectedTaskForceId, setSelectedTaskForceId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [runningOnly, setRunningOnly] = useState(false);
  const [linearWorkspace, setLinearWorkspace] = useState("");
  const [notifications, setNotifications] = useState<NotificationSettings>({ enabled: false, events: [] });

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
    if (isTauri) setSidebarMode("factory");
    loadLogsFor(name);
  };

  // Branches/worktrees for the Factory sidebar's "Branches & worktrees" section — the same
  // query keys OverviewTab uses for its own list, so this shares the cache rather than
  // double-fetching.
  const branchesQuery = useBranches(selected ?? "");
  const worktreesQuery = useWorktrees(selected ?? "");
  const branchEntries: BranchEntry[] = useMemo(() => {
    const wt = (worktreesQuery.data ?? [])
      .filter((w) => !w.bare)
      .map((w) => ({
        id: `wt:${w.path}`,
        name: w.branch ?? (w.detached ? "detached HEAD" : "—"),
        kind: "worktree" as const,
      }));
    const br = (branchesQuery.data ?? []).map((b) => ({
      id: `br:${b.name}`,
      name: b.name,
      kind: "branch" as const,
    }));
    return [...wt, ...br];
  }, [worktreesQuery.data, branchesQuery.data]);

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
    setSidebarMode("factory");
    setView("cockpit");
    loadLogsFor(entry.project);
  };

  // Resolve the selected TaskForce object (for the Cockpit) from the same factory overview
  // the sidebar/FeaturePage use, rather than fetching it separately.
  const factoryQuery = useFactory(selected ?? "");
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

  const isRunning = (name: string) => {
    const s = servers[name];
    return s?.status === "running" || s?.status === "starting";
  };
  const runningCount = projects.filter((p) => isRunning(p.name)).length;

  const query = filter.trim().toLowerCase();
  let visibleProjects = query
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.currentBranch ?? "").toLowerCase().includes(query),
      )
    : projects;
  if (runningOnly) visibleProjects = visibleProjects.filter((p) => isRunning(p.name));
  // Float running servers to the top; stable sort keeps recency order within each group.
  visibleProjects = [...visibleProjects].sort(
    (a, b) => Number(isRunning(b.name)) - Number(isRunning(a.name)),
  );

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
          {/* Controls — hidden when the sidebar is collapsed to icons */}
          <div className="flex flex-col gap-2 group-data-[collapsible=icon]:hidden">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setFilter("")}
                placeholder="Filter projects…"
                spellCheck={false}
                className="h-8 pl-8 pr-8 text-sm"
              />
              {filter && (
                <button
                  onClick={() => setFilter("")}
                  aria-label="Clear filter"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => setRunningOnly((v) => !v)}
              disabled={runningCount === 0 && !runningOnly}
              title={runningCount ? "Show only running servers" : "No servers running"}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                runningOnly
                  ? "border-[var(--success)]/50 bg-[var(--success)]/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent disabled:opacity-60 disabled:hover:bg-transparent",
              )}
            >
              <StatusDot status={runningCount > 0 ? "running" : undefined} />
              {runningCount} running server{runningCount === 1 ? "" : "s"}
              {runningOnly && <span className="ml-auto text-[10px] uppercase tracking-wide">filtered</span>}
            </button>
          </div>
        </SidebarHeader>

        <SidebarContent className="custom-scroll">
          <SidebarGroup>
            <SidebarMenu>
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
            </SidebarMenu>
          </SidebarGroup>
          {sidebarMode === "factory" && selected && isTauri ? (
            <FactorySidebar
              project={selected}
              branchEntries={branchEntries}
              onBack={() => {
                setSidebarMode("projects");
                setView("project");
              }}
              onOpenFeature={(featureId) => {
                setSelectedFeatureId(featureId);
                setSelectedTaskForceId(null);
                setView("feature");
              }}
              onOpenTaskForce={openTaskForce}
              onOpenBranch={() => setView("project")}
            />
          ) : (
          <SidebarGroup>
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            {loading && (
              <SidebarMenu>
                {Array.from({ length: 10 }).map((_, i) => (
                  <SidebarMenuItem key={i}>
                    <div className="flex h-7 items-center gap-2 px-2">
                      <Skeleton className="size-4 shrink-0 rounded" />
                      <Skeleton
                        className="h-3.5 rounded group-data-[collapsible=icon]:hidden"
                        style={{ width: `${55 + ((i * 13) % 35)}%` }}
                      />
                    </div>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
            {!loading && projects.length === 0 && (
              <div className="px-2 py-1 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                No git repos found.
              </div>
            )}
            {!loading && projects.length > 0 && visibleProjects.length === 0 && (
              <div className="px-2 py-1 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                {runningOnly && !query ? "No servers running." : `No projects match “${filter.trim()}”.`}
              </div>
            )}
            <SidebarMenu>
              {visibleProjects.map((p) => {
                const s = servers[p.name];
                const active = selected === p.name && view === "project";
                const running = s?.status === "running" || s?.status === "starting";
                const projectUnread = unreadForProject(p.name);
                return (
                  <SidebarMenuItem key={p.name}>
                    <SidebarMenuButton
                      size="sm"
                      isActive={active}
                      tooltip={p.name}
                      title={p.name}
                      onClick={() => selectProject(p.name)}
                    >
                      <ProjectIcon name={iconNameFor(p.name, projectIcons)} />
                      <span className="truncate">{p.name}</span>
                    </SidebarMenuButton>
                    {(running || projectUnread > 0) && (
                      <SidebarMenuBadge className="flex items-center gap-1">
                        {running && <StatusDot status={s!.status} />}
                        <UnreadPill count={projectUnread} testId={`unread-pill-project-${p.name}`} />
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="sm" tooltip="Rescan projects" onClick={refreshProjects}>
                <RefreshCw />
                <span>Rescan</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
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
        ) : view === "inbox" ? (
          <InboxView onOpen={openInboxEntry} />
        ) : !selectedProject ? (
          <>
            <div className="flex h-14 items-center gap-2 border-b border-border px-4">
              <SidebarTrigger />
            </div>
            <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
              <FolderGit2 className="size-10 opacity-40" />
              <div>Select a project to get started</div>
            </div>
          </>
        ) : view === "feature" ? (
          <FeaturePage
            project={selectedProject.name}
            featureId={selectedFeatureId}
            onOpenTaskForce={openTaskForce}
          />
        ) : view === "cockpit" ? (
          selectedTaskForce ? (
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
          )
        ) : (
          <ProjectDetail
            project={selectedProject}
            server={selectedServer}
            logs={logs[selectedProject.name] ?? []}
            onCommandChange={refreshProjects}
            linearWorkspace={linearWorkspace}
          />
        )}
      </SidebarInset>

      <Toaster theme={theme} position="bottom-right" richColors closeButton />
    </SidebarProvider>
  );
}

function ProjectDetail({
  project,
  server,
  logs,
  onCommandChange,
  linearWorkspace,
}: {
  project: ProjectSummary;
  server: RunningServer | null;
  logs: LogLine[];
  onCommandChange: () => void;
  linearWorkspace: string;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <SidebarTrigger className="shrink-0" />
        <IconPicker project={project.name} />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold truncate">{project.name}</h1>
          <div className="text-xs text-muted-foreground font-mono truncate">{project.path}</div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <OverviewTab
          key={project.name}
          project={project}
          server={server}
          logs={logs}
          onCommandChange={onCommandChange}
          linearWorkspace={linearWorkspace}
        />
      </div>
    </>
  );
}
