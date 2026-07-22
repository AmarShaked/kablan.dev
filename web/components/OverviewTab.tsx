import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import {
  Play,
  Square,
  GitBranch,
  FolderTree,
  Check,
  ArrowLeftRight,
  DownloadCloud,
  Search,
  ChevronDown,
  ChevronRight,
  Cloud,
  X,
  Clock,
  ArrowDownAZ,
  RefreshCw,
} from "lucide-react";
import {
  api,
  type ProjectSummary,
  type Branch,
  type Worktree,
  type RunningServer,
  type LogLine,
} from "../api.ts";
import { useBranches, useWorktrees, qk } from "../queries.ts";
import { ItemDrawer } from "./ItemDrawer.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { LinearLink, extractLinearId } from "./LinearLink.tsx";

type SortMode = "recent" | "name";
type Kind = "worktree" | "branch";

export interface Entry {
  id: string;
  kind: Kind;
  name: string;
  head: string | null;
  current: boolean;
  isMain: boolean;
  locked: boolean;
  upstream: string | null;
  behind: number;
  branchName: string | null; // actual branch to pull (null for detached)
  author: string | null;
  ts: number | null;
  dateRel: string | null;
  cwd: string | null; // worktree dir to run in
  runBranch: string | null; // branch to check out + run (branch rows)
  inWorktree: string | null; // branch already checked out in a worktree
  remoteOnly: boolean; // branch exists only on a remote (not local yet)
  linearId: string | null;
}

type Row = { type: "group"; kind: Kind; label: string; count: number } | { type: "item"; entry: Entry };

const DATE_WINDOWS: Record<string, number> = {
  any: 0,
  "1d": 86400,
  "7d": 604800,
  "30d": 2592000,
  "90d": 7776000,
};

function relTime(ts: number | null): string {
  if (!ts) return "";
  const diff = Date.now() / 1000 - ts;
  const m = Math.floor(diff / 60);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

const AVATAR_COLORS = [
  "bg-rose-500/20 text-rose-700 dark:text-rose-300",
  "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  "bg-sky-500/20 text-sky-700 dark:text-sky-300",
  "bg-violet-500/20 text-violet-700 dark:text-violet-300",
  "bg-pink-500/20 text-pink-700 dark:text-pink-300",
  "bg-teal-500/20 text-teal-700 dark:text-teal-300",
  "bg-orange-500/20 text-orange-700 dark:text-orange-300",
];

/** Loading placeholder shaped like the grouped list (group bands + 46px rows). */
function ListSkeleton() {
  const groups = [6, 8];
  return (
    <div className="flex-1 overflow-hidden px-4 py-3">
      {groups.map((n, gi) => (
        <div key={gi}>
          <div className="mb-1 flex h-8 items-center rounded-md bg-accent/40 px-3">
            <Skeleton className="h-3 w-28" />
          </div>
          {Array.from({ length: n }).map((_, i) => (
            <div key={i} className="flex h-11 items-center gap-2 px-3">
              <Skeleton className="size-3.5 shrink-0 rounded" />
              <Skeleton className="h-3.5 rounded" style={{ width: `${28 + ((i * 17) % 42)}%` }} />
              <div className="ml-auto flex items-center gap-3">
                <Skeleton className="size-3.5 rounded" />
                <Skeleton className="h-3 w-8 rounded" />
                <Skeleton className="size-5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Avatar({ name }: { name: string | null }) {
  if (!name) return <span className="size-5 shrink-0" />;
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return (
    <span
      title={name}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold",
        color,
      )}
    >
      {initials}
    </span>
  );
}

export function OverviewTab({
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
  const queryClient = useQueryClient();
  const branchesQuery = useBranches(project.name);
  const worktreesQuery = useWorktrees(project.name);
  const branches: Branch[] = branchesQuery.data ?? [];
  const worktrees: Worktree[] = worktreesQuery.data ?? [];
  const loading = branchesQuery.isPending || worktreesQuery.isPending;

  const [busy, setBusy] = useState(false);
  const [gitBusy, setGitBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [author, setAuthor] = useState("all");
  const [dateWindow, setDateWindow] = useState("any");
  const [runningOnly, setRunningOnly] = useState(false);
  const [sort, setSort] = useState<SortMode>("recent");
  const [collapsed, setCollapsed] = useState<Record<Kind, boolean>>({ worktree: false, branch: false });
  const [drawer, setDrawer] = useState<{ entry: Entry; tab: string } | null>(null);

  const reload = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.branches(project.name) }),
        queryClient.invalidateQueries({ queryKey: qk.worktrees(project.name) }),
      ]),
    [queryClient, project.name],
  );

  const currentBranch = branches.find((b) => b.current)?.name ?? project.currentBranch;

  const start = async (opts: { cwd?: string; branch?: string | null }, entry?: Entry) => {
    setBusy(true);
    try {
      await api.startServer(project.name, opts);
      toast.success("Dev server started");
      if (entry) setDrawer({ entry, tab: "logs" });
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

  // The project's single dev server is "on" this entry if it's running in the entry's directory
  // (worktree path, or the main repo on this entry's branch).
  const serverRunning = server?.status === "running" || server?.status === "starting";
  const isEntryRunning = (entry: Entry) => {
    if (!serverRunning || !server) return false;
    if (entry.cwd) return server.cwd === entry.cwd;
    // Branch entry runs in the main repo: match the server's branch, or the current
    // branch when the server was started without a specific branch (from the header).
    if (server.cwd !== project.path) return false;
    return server.branch === entry.branchName || (entry.current && !server.branch);
  };

  const checkout = async (branch: string) => {
    setGitBusy(true);
    try {
      await api.checkout(project.name, branch);
      toast.success(`Switched to ${branch}`);
      await reload();
      onCommandChange();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setGitBusy(false);
    }
  };

  const pullEntry = async (entry: Entry) => {
    if (!entry.branchName) return;
    setGitBusy(true);
    try {
      const res = await api.pullBranch(project.name, entry.branchName, entry.cwd ?? undefined);
      toast.success(res.output, { duration: 6000 });
      await reload();
      onCommandChange();
    } catch (err) {
      toast.error(String(err), { duration: 8000 });
    } finally {
      setGitBusy(false);
    }
  };

  const fetchRemote = async () => {
    setGitBusy(true);
    try {
      const res = await api.fetchRemote(project.name);
      toast.success(res.output || "Fetched.", { duration: 5000 });
      await reload();
      onCommandChange();
    } catch (err) {
      toast.error(String(err), { duration: 8000 });
    } finally {
      setGitBusy(false);
    }
  };

  const filtersActive =
    search.trim() !== "" || author !== "all" || dateWindow !== "any" || runningOnly || sort !== "recent";
  const clearFilters = () => {
    setSearch("");
    setAuthor("all");
    setDateWindow("any");
    setRunningOnly(false);
    setSort("recent");
  };

  // --- Build the unified entry list ---
  const allEntries = useMemo<Entry[]>(() => {
    const worktreeByBranch = new Map<string, string>();
    for (const w of worktrees) {
      if (w.branch && !w.isMain && !w.bare) worktreeByBranch.set(w.branch, w.path);
    }
    const branchByName = new Map(branches.map((b) => [b.name, b]));
    const wtEntries: Entry[] = worktrees
      .filter((w) => !w.bare)
      .map((w) => {
        const meta = w.branch ? branchByName.get(w.branch) : undefined;
        return {
          id: `wt:${w.path}`,
          kind: "worktree" as const,
          name: w.branch ?? (w.detached ? "detached HEAD" : "—"),
          head: w.head,
          current: !!w.branch && w.branch === currentBranch,
          isMain: w.isMain,
          locked: w.locked,
          upstream: meta?.upstream ?? null,
          behind: meta?.behind ?? 0,
          branchName: w.branch,
          author: w.author,
          ts: w.lastCommitTs,
          dateRel: relTime(w.lastCommitTs),
          cwd: w.path,
          runBranch: null,
          inWorktree: null,
          remoteOnly: false,
          linearId: extractLinearId(w.branch),
        };
      });
    const brEntries: Entry[] = branches.map((b) => ({
      id: `br:${b.name}`,
      kind: "branch" as const,
      name: b.name,
      head: b.lastCommit,
      current: b.current,
      isMain: false,
      locked: false,
      upstream: b.upstream,
      behind: b.behind,
      branchName: b.name,
      author: b.author,
      ts: b.lastCommitTs,
      dateRel: b.lastCommitDate ? relTime(b.lastCommitTs) : null,
      cwd: worktreeByBranch.get(b.name) ?? null,
      runBranch: b.name,
      inWorktree: worktreeByBranch.get(b.name) ?? null,
      remoteOnly: b.remoteOnly,
      linearId: extractLinearId(b.name),
    }));
    return [...wtEntries, ...brEntries];
  }, [worktrees, branches, currentBranch]);

  const authors = useMemo(() => {
    const set = new Set<string>();
    allEntries.forEach((e) => e.author && set.add(e.author));
    return [...set].sort();
  }, [allEntries]);

  // --- Filter + group + flatten into virtualizer rows ---
  const rows = useMemo<Row[]>(() => {
    const q = search.trim().toLowerCase();
    const win = DATE_WINDOWS[dateWindow] ?? 0;
    const cutoff = win ? Date.now() / 1000 - win : 0;

    const filtered = allEntries.filter((e) => {
      if (runningOnly && !isEntryRunning(e)) return false;
      if (author !== "all" && e.author !== author) return false;
      if (cutoff && (e.ts ?? 0) < cutoff) return false;
      if (q) {
        const hay = `${e.name} ${e.author ?? ""} ${e.head ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorter = (a: Entry, b: Entry) => {
      const ap = a.current || a.isMain ? 0 : 1;
      const bp = b.current || b.isMain ? 0 : 1;
      if (ap !== bp) return ap - bp;
      if (sort === "name") return a.name.localeCompare(b.name);
      return (b.ts ?? -Infinity) - (a.ts ?? -Infinity);
    };

    const groups: { kind: Kind; label: string }[] = [
      { kind: "worktree", label: "Worktrees" },
      { kind: "branch", label: "Branches" },
    ];
    const out: Row[] = [];
    for (const g of groups) {
      const items = filtered.filter((e) => e.kind === g.kind).sort(sorter);
      if (items.length === 0) continue;
      out.push({ type: "group", kind: g.kind, label: g.label, count: items.length });
      if (!collapsed[g.kind]) items.forEach((entry) => out.push({ type: "item", entry }));
    }
    return out;
  }, [allEntries, search, author, dateWindow, runningOnly, server, sort, collapsed]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i].type === "group" ? 40 : 46),
    overscan: 14,
  });

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-1.5">
        <div className="relative w-56 max-w-[38%]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, author, sha…"
            spellCheck={false}
            className="h-7 pl-7 text-xs"
          />
        </div>
        <Select value={author} onValueChange={setAuthor}>
          <SelectTrigger className="!h-7 w-36 text-xs">
            <SelectValue placeholder="Author" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All authors</SelectItem>
            {authors.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dateWindow} onValueChange={setDateWindow}>
          <SelectTrigger className="!h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any time</SelectItem>
            <SelectItem value="1d">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <button
          onClick={() => setRunningOnly((v) => !v)}
          disabled={!serverRunning && !runningOnly}
          title={serverRunning ? "Show only running servers" : "No servers running"}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
            runningOnly
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-border text-muted-foreground hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent",
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full",
              serverRunning ? "bg-emerald-500" : "bg-muted-foreground/40",
            )}
          />
          Running
        </button>
        {filtersActive && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={clearFilters}
          >
            <X className="size-3.5" /> Clear
          </Button>
        )}
        {/* Fetch + Sort — right side */}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          disabled={gitBusy}
          title="Fetch all remotes (git fetch --all --prune)"
          onClick={fetchRemote}
        >
          <RefreshCw className={cn("size-3.5", gitBusy && "animate-spin")} /> Fetch
        </Button>
        <div className="flex h-7 shrink-0 overflow-hidden rounded-md border border-border">
          <button
            onClick={() => setSort("recent")}
            title="Sort by most recent"
            className={cn(
              "flex w-7 items-center justify-center transition-colors",
              sort === "recent" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Clock className="size-3.5" />
          </button>
          <button
            onClick={() => setSort("name")}
            title="Sort A–Z"
            className={cn(
              "flex w-7 items-center justify-center border-l border-border transition-colors",
              sort === "name" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ArrowDownAZ className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Virtualized grouped list */}
      {loading ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">
          {allEntries.length === 0 ? "No branches or worktrees." : "Nothing matches your filters."}
        </p>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-auto custom-scroll px-4 py-3">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              return (
                <div
                  key={vi.key}
                  className="flex items-center py-0.5"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: vi.size,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  {row.type === "group" ? (
                    <button
                      onClick={() => setCollapsed((c) => ({ ...c, [row.kind]: !c[row.kind] }))}
                      className={cn(
                        "flex h-8 w-full items-center gap-2 rounded-md px-3 text-xs font-semibold uppercase tracking-wide transition-colors",
                        row.kind === "worktree"
                          ? "bg-violet-500/10 text-violet-600 hover:bg-violet-500/15 dark:text-violet-300"
                          : "bg-sky-500/10 text-sky-600 hover:bg-sky-500/15 dark:text-sky-300",
                      )}
                    >
                      {collapsed[row.kind] ? (
                        <ChevronRight className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                      {row.kind === "worktree" ? (
                        <FolderTree className="size-3.5" />
                      ) : (
                        <GitBranch className="size-3.5" />
                      )}
                      {row.label}
                      <span className="rounded bg-background/50 px-1.5 py-0.5 text-[10px]">{row.count}</span>
                    </button>
                  ) : (
                    <EntryRow
                      entry={row.entry}
                      linearWorkspace={linearWorkspace}
                      busy={busy}
                      gitBusy={gitBusy}
                      running={isEntryRunning(row.entry)}
                      active={drawer?.entry.id === row.entry.id}
                      onOpen={() => setDrawer({ entry: row.entry, tab: "overview" })}
                      onRun={() =>
                        row.entry.cwd
                          ? start({ cwd: row.entry.cwd })
                          : start({ cwd: project.path, branch: row.entry.runBranch })
                      }
                      onStop={stop}
                      onCheckout={row.entry.runBranch ? () => checkout(row.entry.runBranch!) : undefined}
                      onPull={
                        row.entry.behind > 0 && row.entry.branchName
                          ? () => pullEntry(row.entry)
                          : undefined
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ItemDrawer
        entry={drawer?.entry ?? null}
        open={!!drawer}
        tab={drawer?.tab ?? "overview"}
        onTabChange={(t) => setDrawer((d) => (d ? { ...d, tab: t } : d))}
        onOpenChange={(o) => !o && setDrawer(null)}
        project={project}
        server={server}
        logs={logs}
        linearWorkspace={linearWorkspace}
        busy={busy}
        gitBusy={gitBusy}
        running={drawer ? isEntryRunning(drawer.entry) : false}
        onStop={stop}
        onRun={() =>
          drawer &&
          (drawer.entry.cwd
            ? start({ cwd: drawer.entry.cwd }, drawer.entry)
            : start({ cwd: project.path, branch: drawer.entry.runBranch }, drawer.entry))
        }
        onCheckout={
          drawer?.entry.runBranch && !drawer.entry.current && !drawer.entry.inWorktree
            ? () => checkout(drawer.entry.runBranch!)
            : undefined
        }
        onPull={
          drawer?.entry && drawer.entry.branchName && drawer.entry.upstream && !drawer.entry.remoteOnly
            ? () => pullEntry(drawer.entry)
            : undefined
        }
      />
    </div>
  );
}

function EntryRow({
  entry,
  linearWorkspace,
  busy,
  gitBusy,
  active,
  running,
  onOpen,
  onRun,
  onStop,
  onCheckout,
  onPull,
}: {
  entry: Entry;
  linearWorkspace: string;
  busy: boolean;
  gitBusy: boolean;
  active: boolean;
  running: boolean;
  onOpen: () => void;
  onRun: () => void;
  onStop: () => void;
  onCheckout?: () => void;
  onPull?: () => void;
}) {
  const canCheckout = entry.kind === "branch" && !entry.current && !entry.inWorktree && onCheckout;
  const TypeIcon = entry.kind === "worktree" ? FolderTree : GitBranch;
  const withStop = (fn?: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn?.();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      className={cn(
        "group flex h-full w-full cursor-pointer items-center gap-2 rounded-lg border border-transparent px-3 hover:border-border hover:bg-accent/50",
        active && "border-border bg-accent/60",
      )}
    >
      <TypeIcon
        className={cn(
          "size-3.5 shrink-0",
          entry.kind === "worktree" ? "text-violet-500 dark:text-violet-400" : "text-sky-500 dark:text-sky-400",
        )}
      />
      <span className="truncate text-sm">{entry.name}</span>
      {entry.current && (
        <Badge className="shrink-0 border-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Check className="size-3" /> current
        </Badge>
      )}
      {entry.isMain && (
        <Badge className="shrink-0 border-0 bg-sky-500/15 text-sky-600 dark:text-sky-400">main</Badge>
      )}
      {entry.inWorktree && (
        <Badge className="shrink-0 gap-1 border-0 bg-violet-500/15 text-violet-600 dark:text-violet-400">
          <FolderTree className="size-3" /> worktree
        </Badge>
      )}
      {entry.locked && (
        <Badge className="shrink-0 border-0 bg-amber-500/15 text-amber-600 dark:text-amber-400">locked</Badge>
      )}
      {entry.remoteOnly && (
        <Badge className="shrink-0 gap-1 border-0 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
          <Cloud className="size-3" /> remote
        </Badge>
      )}
      {running && (
        <span
          title="Dev server running"
          className="ml-1 flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
        >
          <span className="size-2 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_6px_0] shadow-emerald-500/60" />
          running
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
        {entry.linearId && linearWorkspace && <LinearLink id={entry.linearId} workspace={linearWorkspace} />}
        {onPull ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-1.5 text-xs text-amber-600 hover:bg-amber-500/15 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-400"
            disabled={gitBusy}
            title={`Pull ${entry.behind} commit${entry.behind === 1 ? "" : "s"} from ${entry.upstream}`}
            onClick={withStop(onPull)}
          >
            <DownloadCloud className="size-3.5" />↓{entry.behind}
          </Button>
        ) : (
          entry.upstream && (
            <Cloud
              className="size-3.5 shrink-0 text-muted-foreground/70"
              aria-label="Tracks remote"
            >
              <title>{`Tracks ${entry.upstream}`}</title>
            </Cloud>
          )
        )}
        {entry.head && <span className="hidden font-mono opacity-70 sm:inline">{entry.head}</span>}
        <span className="w-10 text-right tabular-nums">{entry.dateRel}</span>
        <Avatar name={entry.author} />
        <div
          className={cn(
            "flex items-center gap-1 transition-opacity",
            running ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          {canCheckout && !running && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              disabled={gitBusy || busy}
              title="Check out this branch in the main repo"
              onClick={withStop(onCheckout)}
            >
              <ArrowLeftRight className="size-3.5" />
            </Button>
          )}
          {running ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              title="Stop dev server"
              onClick={withStop(onStop)}
            >
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              disabled={busy}
              title={entry.cwd ? "Start dev server in this worktree" : "Check out & start dev server"}
              onClick={withStop(onRun)}
            >
              <Play className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
