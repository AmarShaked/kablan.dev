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
  ListFilter,
  User,
  CalendarDays,
  Link2,
  ChevronLeft,
  ExternalLink,
  Server,
  Pencil,
  GitMerge,
  CircleAlert,
} from "lucide-react";
import {
  api,
  type ProjectSummary,
  type Branch,
  type Worktree,
  type RunningServer,
  type LogLine,
  type OpenTarget,
  type GitlabMergeRequest,
} from "../api.ts";
import { useBranches, useWorktrees, useGitlabOverview, qk } from "../queries.ts";
import { ItemDrawer } from "./ItemDrawer.tsx";
import { OpenMenu } from "./OpenMenu.tsx";
import { pipelineTone } from "./GitlabSection.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { LinearLink } from "./LinearLink.tsx";
import { type Entry, branchToEntry, worktreeToEntry } from "../lib/entries.ts";

// `Entry` used to be defined in this file; it now lives in `../lib/entries.ts` (alongside the
// branch/worktree -> Entry builders) so it can be reused outside the branches/worktrees list
// (e.g. the worktree cockpit). Re-exported here so `ItemDrawer.tsx`'s `import type { Entry }
// from "./OverviewTab.tsx"` keeps working unchanged.
export type { Entry };

type SortMode = "recent" | "name";
type Kind = "worktree" | "branch";

type Row = { type: "group"; kind: Kind; label: string; count: number } | { type: "item"; entry: Entry };

const DATE_WINDOWS: Record<string, number> = {
  any: 0,
  "1d": 86400,
  "7d": 604800,
  "30d": 2592000,
  "90d": 7776000,
};

const DATE_LABELS: Record<string, string> = {
  any: "Any time",
  "1d": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

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

/** One row inside the filter popover — a submenu opener (chevron), a toggle, or an option (check). */
function FilterRow({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
  chevron,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  chevron?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0 opacity-80" />}
      <span className="flex-1 truncate text-left">{label}</span>
      {chevron && <ChevronRight className="size-3.5 shrink-0 opacity-60" />}
      {active && !chevron && <Check className="size-3.5 shrink-0 text-[var(--success)]" />}
    </button>
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

  const gitlab = useGitlabOverview(project.name);
  const mrByBranch = useMemo(() => {
    const m = new Map<string, GitlabMergeRequest>();
    gitlab.data?.mrs.forEach((mr) => m.set(mr.sourceBranch, mr));
    return m;
  }, [gitlab.data]);
  const ciByRef = useMemo(() => {
    const m = new Map<string, string>();
    gitlab.data?.pipelines.forEach((p) => m.set(p.ref, p.status));
    gitlab.data?.mrs.forEach((mr) => {
      if (mr.pipelineStatus && !m.has(mr.sourceBranch)) m.set(mr.sourceBranch, mr.pipelineStatus);
    });
    return m;
  }, [gitlab.data]);

  const [busy, setBusy] = useState(false);
  const [gitBusy, setGitBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [author, setAuthor] = useState("all");
  const [dateWindow, setDateWindow] = useState("any");
  const [runningOnly, setRunningOnly] = useState(false);
  const [hasLinear, setHasLinear] = useState(false);
  const [mainOnly, setMainOnly] = useState(false);
  const [dirtyOnly, setDirtyOnly] = useState(false);
  const [hasMr, setHasMr] = useState(false);
  const [ciFailing, setCiFailing] = useState(false);
  const [location, setLocation] = useState<"all" | "local" | "remote">("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterView, setFilterView] = useState<"root" | "author" | "date" | "location">("root");
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

  const activeCount =
    (author !== "all" ? 1 : 0) +
    (dateWindow !== "any" ? 1 : 0) +
    (runningOnly ? 1 : 0) +
    (hasLinear ? 1 : 0) +
    (mainOnly ? 1 : 0) +
    (dirtyOnly ? 1 : 0) +
    (location !== "all" ? 1 : 0) +
    (hasMr ? 1 : 0) +
    (ciFailing ? 1 : 0);
  const filtersActive = search.trim() !== "" || activeCount > 0 || sort !== "recent";
  const clearFilters = () => {
    setSearch("");
    setAuthor("all");
    setDateWindow("any");
    setRunningOnly(false);
    setHasLinear(false);
    setMainOnly(false);
    setDirtyOnly(false);
    setLocation("all");
    setSort("recent");
    setHasMr(false);
    setCiFailing(false);
  };

  const openInRow = async (entry: Entry, target: OpenTarget) => {
    try {
      await api.openIn(project.name, target, { cwd: entry.cwd ?? project.path });
    } catch (err) {
      toast.error(String(err));
    }
  };

  // --- Build the unified entry list ---
  const allEntries = useMemo<Entry[]>(() => {
    const worktreeByBranch = new Map<string, string>();
    const dirtyByBranch = new Map<string, boolean>();
    for (const w of worktrees) {
      if (w.branch && !w.bare) dirtyByBranch.set(w.branch, w.dirty);
      if (w.branch && !w.isMain && !w.bare) worktreeByBranch.set(w.branch, w.path);
    }
    const branchByName = new Map(branches.map((b) => [b.name, b]));
    const wtEntries: Entry[] = worktrees
      .filter((w) => !w.bare)
      .map((w) => worktreeToEntry(w, w.branch ? branchByName.get(w.branch) : undefined, currentBranch));
    const brEntries: Entry[] = branches.map((b) =>
      branchToEntry(b, worktreeByBranch.get(b.name) ?? null, dirtyByBranch.get(b.name) ?? false),
    );
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

    const isMainEntry = (e: Entry) => e.isMain || e.name === "main" || e.name === "master";
    const filtered = allEntries.filter((e) => {
      if (runningOnly && !isEntryRunning(e)) return false;
      if (author !== "all" && e.author !== author) return false;
      if (hasLinear && !e.linearId) return false;
      if (mainOnly && !isMainEntry(e)) return false;
      if (dirtyOnly && !e.dirty) return false;
      if (hasMr && !(e.branchName && mrByBranch.has(e.branchName))) return false;
      if (ciFailing && !(e.branchName && ciByRef.get(e.branchName) === "failed")) return false;
      if (location === "local" && e.remoteOnly) return false;
      if (location === "remote" && !e.remoteOnly) return false;
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
  }, [allEntries, search, author, dateWindow, runningOnly, hasLinear, mainOnly, dirtyOnly, hasMr, ciFailing, mrByBranch, ciByRef, location, server, sort, collapsed]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i].type === "group" ? 40 : 46),
    overscan: 14,
  });

  // Active filters, rendered as removable chips (Linear-style).
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (author !== "all") chips.push({ key: "author", label: author, clear: () => setAuthor("all") });
  if (dateWindow !== "any")
    chips.push({ key: "date", label: DATE_LABELS[dateWindow], clear: () => setDateWindow("any") });
  if (runningOnly) chips.push({ key: "running", label: "Running", clear: () => setRunningOnly(false) });
  if (hasLinear) chips.push({ key: "linear", label: "Has Linear", clear: () => setHasLinear(false) });
  if (mainOnly) chips.push({ key: "main", label: "Main only", clear: () => setMainOnly(false) });
  if (dirtyOnly) chips.push({ key: "dirty", label: "Uncommitted", clear: () => setDirtyOnly(false) });
  if (hasMr) chips.push({ key: "mr", label: "Has open MR", clear: () => setHasMr(false) });
  if (ciFailing) chips.push({ key: "ci", label: "CI failing", clear: () => setCiFailing(false) });
  if (location !== "all")
    chips.push({
      key: "loc",
      label: location === "local" ? "Local only" : "Remote only",
      clear: () => setLocation("all"),
    });

  const closeFilter = () => {
    setFilterOpen(false);
    setFilterView("root");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar — minimal, Linear-style */}
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-1.5">
        <div className="relative w-52 shrink-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            spellCheck={false}
            className="h-7 pl-7 text-xs"
          />
        </div>

        <Popover
          open={filterOpen}
          onOpenChange={(o) => {
            setFilterOpen(o);
            if (!o) setFilterView("root");
          }}
        >
          <PopoverTrigger asChild>
            <button
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs transition-colors hover:bg-accent",
                activeCount > 0 ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <ListFilter className="size-3.5" /> Filter
              {activeCount > 0 && (
                <span className="rounded bg-accent px-1 text-[10px] tabular-nums">{activeCount}</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-1">
            {filterView === "root" && (
              <div className="flex flex-col">
                <FilterRow icon={User} label="Author" chevron onClick={() => setFilterView("author")} />
                <FilterRow icon={CalendarDays} label="Updated" chevron onClick={() => setFilterView("date")} />
                <FilterRow icon={Cloud} label="Location" chevron onClick={() => setFilterView("location")} />
                <div className="my-1 h-px bg-border" />
                <FilterRow
                  icon={Server}
                  label="Running server"
                  active={runningOnly}
                  disabled={!serverRunning && !runningOnly}
                  onClick={() => {
                    setRunningOnly((v) => !v);
                    closeFilter();
                  }}
                />
                <FilterRow
                  icon={Link2}
                  label="Has Linear ticket"
                  active={hasLinear}
                  onClick={() => {
                    setHasLinear((v) => !v);
                    closeFilter();
                  }}
                />
                <FilterRow
                  icon={GitBranch}
                  label="Main branches only"
                  active={mainOnly}
                  onClick={() => {
                    setMainOnly((v) => !v);
                    closeFilter();
                  }}
                />
                <FilterRow
                  icon={Pencil}
                  label="Uncommitted changes"
                  active={dirtyOnly}
                  onClick={() => {
                    setDirtyOnly((v) => !v);
                    closeFilter();
                  }}
                />
                {gitlab.data?.connected && (
                  <>
                    <FilterRow
                      icon={GitMerge}
                      label="Has open MR"
                      active={hasMr}
                      onClick={() => { setHasMr((v) => !v); closeFilter(); }}
                    />
                    <FilterRow
                      icon={CircleAlert}
                      label="CI failing"
                      active={ciFailing}
                      onClick={() => { setCiFailing((v) => !v); closeFilter(); }}
                    />
                  </>
                )}
              </div>
            )}
            {filterView !== "root" && (
              <div className="flex flex-col">
                <button
                  onClick={() => setFilterView("root")}
                  className="mb-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium hover:bg-accent"
                >
                  <ChevronLeft className="size-3.5" />
                  {filterView === "author" ? "Author" : filterView === "date" ? "Updated" : "Location"}
                </button>
                <div className="mb-1 h-px bg-border" />
                <div className="max-h-64 overflow-y-auto custom-scroll">
                  {filterView === "author" && (
                    <>
                      <FilterRow label="All authors" active={author === "all"} onClick={() => { setAuthor("all"); closeFilter(); }} />
                      {authors.map((a) => (
                        <FilterRow key={a} label={a} active={author === a} onClick={() => { setAuthor(a); closeFilter(); }} />
                      ))}
                    </>
                  )}
                  {filterView === "date" &&
                    Object.keys(DATE_LABELS).map((k) => (
                      <FilterRow key={k} label={DATE_LABELS[k]} active={dateWindow === k} onClick={() => { setDateWindow(k); closeFilter(); }} />
                    ))}
                  {filterView === "location" && (
                    <>
                      <FilterRow label="Anywhere" active={location === "all"} onClick={() => { setLocation("all"); closeFilter(); }} />
                      <FilterRow label="Local only" active={location === "local"} onClick={() => { setLocation("local"); closeFilter(); }} />
                      <FilterRow label="Remote only" active={location === "remote"} onClick={() => { setLocation("remote"); closeFilter(); }} />
                    </>
                  )}
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Active filter chips */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto custom-scroll">
          {chips.map((c) => (
            <span
              key={c.key}
              className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-accent/50 px-2 py-0.5 text-xs text-foreground"
            >
              {c.label}
              <button
                onClick={c.clear}
                aria-label={`Remove ${c.label} filter`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {activeCount > 0 && (
            <button
              onClick={clearFilters}
              className="shrink-0 px-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>

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
                      onOpenIn={(t) => openInRow(row.entry, t)}
                      mr={row.entry.branchName ? mrByBranch.get(row.entry.branchName) : undefined}
                      ciStatus={row.entry.branchName ? ciByRef.get(row.entry.branchName) ?? null : null}
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
  onOpenIn,
  mr,
  ciStatus,
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
  onOpenIn: (target: OpenTarget) => void;
  mr?: GitlabMergeRequest;
  ciStatus?: string | null;
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
      {ciStatus && (
        <span
          title={`CI: ${ciStatus}`}
          className={cn(
            "size-2 shrink-0 rounded-full",
            ciStatus === "success" ? "bg-emerald-500" : ciStatus === "failed" ? "bg-rose-500" : "bg-amber-500",
          )}
        />
      )}
      {mr && (
        <a
          href={mr.webUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "shrink-0 rounded-md border-0 px-1.5 py-0.5 text-[10.5px] font-semibold",
            "bg-orange-500/15 text-orange-600 dark:text-orange-400",
          )}
          title={mr.title}
        >
          !{mr.iid}
          {mr.draft ? " draft" : ""}
        </a>
      )}
      {entry.dirty && (
        <span
          title="Uncommitted changes"
          className="size-2 shrink-0 rounded-full bg-amber-500"
          aria-label="Uncommitted changes"
        />
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
        <OpenMenu
          onPick={onOpenIn}
          trigger={
            <button
              onClick={(e) => e.stopPropagation()}
              title="Open in editor / terminal / Finder"
              className="text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
            </button>
          }
        />
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
