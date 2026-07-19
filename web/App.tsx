import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { FolderGit2, RefreshCw, Settings, Play, Square, Search, X } from "lucide-react";
import { api, type ProjectSummary, type RunningServer, type LogLine } from "./api.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { OverviewTab } from "./components/OverviewTab.tsx";
import { EnvTab } from "./components/EnvTab.tsx";
import { LogsTab } from "./components/LogsTab.tsx";
import { SettingsPage } from "./components/SettingsPage.tsx";
import { StatusDot } from "./components/StatusDot.tsx";

type View = "project" | "settings";

/** Compact relative time from a unix timestamp (seconds). */
function relTime(ts: number | null): string {
  if (!ts) return "";
  const diff = Date.now() / 1000 - ts;
  const mins = Math.floor(diff / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("project");
  const [parentDir, setParentDir] = useState("");
  const [parentDraft, setParentDraft] = useState("");
  const [filter, setFilter] = useState("");
  const [runningOnly, setRunningOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const [servers, setServers] = useState<Record<string, RunningServer>>({});
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({});

  const refreshProjects = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.getConfig().then((c) => {
      setParentDir(c.parentDir);
      setParentDraft(c.parentDir);
    });
    refreshProjects();
  }, [refreshProjects]);

  // --- WebSocket: live status + logs ---
  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "hello") {
          const map: Record<string, RunningServer> = {};
          for (const s of msg.servers as RunningServer[]) map[s.projectName] = s;
          setServers(map);
        } else if (msg.type === "status") {
          setServers((prev) => {
            const next = { ...prev };
            if (msg.server) next[msg.projectName] = msg.server;
            return next;
          });
        } else if (msg.type === "log") {
          const { projectName, line } = msg;
          setLogs((prev) => {
            const arr = prev[projectName] ? [...prev[projectName], line] : [line];
            if (arr.length > 3000) arr.splice(0, arr.length - 3000);
            return { ...prev, [projectName]: arr };
          });
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
  }, []);

  const saveParentDir = async () => {
    const val = parentDraft.trim();
    if (val === parentDir) return;
    try {
      await api.setParentDir(val);
      setParentDir(val);
      setLoading(true);
      await refreshProjects();
      toast.success("Projects folder updated");
    } catch (err) {
      toast.error(String(err));
    }
  };

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
    loadLogsFor(name);
  };

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
    <div className="grid grid-cols-[300px_1fr] h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex flex-col border-r border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-[15px]">
              <span className="size-2.5 rounded-full bg-primary" />
              Claude Dev Manager
            </div>
            <Button
              variant={view === "settings" ? "secondary" : "ghost"}
              size="icon"
              className="size-8"
              onClick={() => setView("settings")}
              aria-label="Settings"
            >
              <Settings className="size-4" />
            </Button>
          </div>
          <div className="mt-3">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Scanning folder
            </label>
            <Input
              value={parentDraft}
              onChange={(e) => setParentDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveParentDir()}
              onBlur={saveParentDir}
              spellCheck={false}
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>
          <div className="relative mt-2">
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
              "mt-2 w-full flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
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

        <div className="flex-1 overflow-y-auto custom-scroll">
          <div className="p-2">
            {loading && <div className="p-3 text-sm text-muted-foreground">Scanning projects…</div>}
            {!loading && projects.length === 0 && (
              <div className="p-3 text-sm text-muted-foreground">No git repos found in this folder.</div>
            )}
            {!loading && projects.length > 0 && visibleProjects.length === 0 && (
              <div className="p-3 text-sm text-muted-foreground">
                {runningOnly && !query
                  ? "No servers running."
                  : `No projects match “${filter.trim()}”.`}
              </div>
            )}
            {visibleProjects.map((p) => {
              const s = servers[p.name];
              const active = selected === p.name && view === "project";
              const slash = p.name.lastIndexOf("/");
              const prefix = slash >= 0 ? p.name.slice(0, slash + 1) : "";
              const leaf = slash >= 0 ? p.name.slice(slash + 1) : p.name;
              return (
                <button
                  key={p.name}
                  onClick={() => selectProject(p.name)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
                    "hover:bg-accent",
                    active && "bg-accent",
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {prefix && <span className="font-normal text-muted-foreground text-xs">{prefix}</span>}
                      {leaf}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">
                      ⎇ {p.currentBranch ?? "detached"}
                      {p.lastCommitTs && <span className="opacity-70"> · {relTime(p.lastCommitTs)}</span>}
                    </div>
                  </div>
                  <StatusDot status={s?.status} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-2.5 border-t border-border">
          <Button variant="outline" size="sm" className="w-full" onClick={refreshProjects}>
            <RefreshCw className="size-3.5" /> Rescan
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-col overflow-hidden">
        {view === "settings" ? (
          <SettingsPage
            onClose={() => setView("project")}
            onConfigChanged={async () => {
              const c = await api.getConfig();
              setParentDir(c.parentDir);
              setParentDraft(c.parentDir);
              await refreshProjects();
            }}
            projects={projects}
          />
        ) : !selectedProject ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <FolderGit2 className="size-10 opacity-40" />
            <div>Select a project to get started</div>
          </div>
        ) : (
          <ProjectDetail
            project={selectedProject}
            server={selectedServer}
            logs={logs[selectedProject.name] ?? []}
            onCommandChange={refreshProjects}
          />
        )}
      </main>
    </div>
  );
}

function ProjectDetail({
  project,
  server,
  logs,
  onCommandChange,
}: {
  project: ProjectSummary;
  server: RunningServer | null;
  logs: LogLine[];
  onCommandChange: () => void;
}) {
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const running = server?.status === "running" || server?.status === "starting";

  const start = async () => {
    setBusy(true);
    try {
      await api.startServer(project.name, {});
      toast.success("Dev server started");
      setTab("logs");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try {
      await api.stopServer(project.name);
      toast.success("Server stopped");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold truncate">{project.name}</h1>
          <div className="text-xs text-muted-foreground font-mono truncate">{project.path}</div>
        </div>
        {running ? (
          <Button variant="destructive" onClick={stop} disabled={busy}>
            <Square className="size-4" /> Stop server
          </Button>
        ) : (
          <Button onClick={start} disabled={busy}>
            <Play className="size-4" /> Start dev server
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden gap-0">
        <div className="px-6 border-b border-border">
          <TabsList className="bg-transparent p-0 h-auto gap-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-accent">
              Branches &amp; Worktrees
            </TabsTrigger>
            <TabsTrigger value="env" className="data-[state=active]:bg-accent">
              Environment
            </TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-accent">
              Logs
              {running && <span className="ml-1.5"><StatusDot status="running" /></span>}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex-1 overflow-y-auto custom-scroll p-6 mt-0">
          <OverviewTab
            key={project.name}
            project={project}
            server={server}
            onStarted={() => setTab("logs")}
            onCommandChange={onCommandChange}
          />
        </TabsContent>
        <TabsContent value="env" className="flex-1 overflow-y-auto custom-scroll p-6 mt-0">
          <EnvTab key={project.name} project={project} server={server} />
        </TabsContent>
        <TabsContent value="logs" className="flex-1 overflow-hidden p-6 mt-0">
          <LogsTab project={project} server={server} logs={logs} />
        </TabsContent>
      </Tabs>
    </>
  );
}
