import { useEffect } from "react";
import { toast } from "sonner";
import {
  FolderTree,
  GitBranch,
  Play,
  Square,
  ArrowLeftRight,
  DownloadCloud,
  Check,
  Cloud,
  ExternalLink,
} from "lucide-react";
import { api, type ProjectSummary, type RunningServer, type LogLine, type OpenTarget } from "../api.ts";
import { useCommits, useGitlabOverview } from "../queries.ts";
import { GitlabSection } from "./GitlabSection.tsx";
import { GitLabLogo } from "../lib/brandLogos.tsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { LinearLink } from "./LinearLink.tsx";
import { OpenMenu } from "./OpenMenu.tsx";
import { EnvTab } from "./EnvTab.tsx";
import { LogsTab } from "./LogsTab.tsx";
import type { Entry } from "./OverviewTab.tsx";

/** Find the first localhost URL a dev server printed, so it can be opened. */
function findServerUrl(logs: LogLine[]): string | null {
  const re = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+(?:\/\S*)?/;
  for (const l of logs) {
    const m = l.text.match(re);
    if (m) return m[0].replace(/0\.0\.0\.0/, "localhost");
  }
  return null;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function levelClass(c: number) {
  if (c === 0) return "bg-muted-foreground/15";
  if (c <= 2) return "bg-emerald-500/30";
  if (c <= 5) return "bg-emerald-500/55";
  if (c <= 9) return "bg-emerald-500/75";
  return "bg-emerald-500";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function CommitHeatmap({ timestamps }: { timestamps: number[] }) {
  const WEEKS = 26;
  const counts = new Map<string, number>();
  for (const ts of timestamps) {
    const key = dayKey(new Date(ts * 1000));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() - (WEEKS - 1) * 7);

  const weeks: { date: Date; count: number; future: boolean }[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const col: { date: Date; count: number; future: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      col.push({ date: day, count: counts.get(dayKey(day)) ?? 0, future: day > today });
    }
    weeks.push(col);
  }

  // Label each month above the week where it first appears, but skip any month
  // that occupies fewer than two columns here (e.g. the partial month at the
  // start of the window) so labels don't crowd together.
  const firstCol = new Map<number, number>();
  const colCount = new Map<number, number>();
  weeks.forEach((col, w) => {
    const m = col[0].date.getMonth();
    if (!firstCol.has(m)) firstCol.set(m, w);
    colCount.set(m, (colCount.get(m) ?? 0) + 1);
  });
  const monthLabels = [...firstCol.entries()]
    .filter(([m, w]) => (colCount.get(m) ?? 0) >= 2 && w <= WEEKS - 2)
    .map(([m, w]) => ({ week: w, label: MONTHS[m] }));

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px] pl-[26px] text-[10px] text-muted-foreground">
        {weeks.map((_, wi) => {
          const label = monthLabels.find((m) => m.week === wi);
          return (
            <div key={wi} className="w-[14px] shrink-0 whitespace-nowrap">
              {label ? label.label : ""}
            </div>
          );
        })}
      </div>
      <div className="flex gap-[3px]">
        <div className="mr-1 flex w-[22px] shrink-0 flex-col gap-[3px] text-[9px] text-muted-foreground">
          {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
            <div key={i} className="h-[14px] leading-[14px]">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((col, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {col.map((cell, di) => (
              <div
                key={di}
                title={
                  cell.future
                    ? ""
                    : `${cell.count} commit${cell.count === 1 ? "" : "s"} · ${cell.date.toDateString()}`
                }
                className={cn(
                  "size-[14px] shrink-0 rounded-[3px]",
                  cell.future ? "opacity-0" : levelClass(cell.count),
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-mono">{children}</span>
    </div>
  );
}

export function ItemDrawer({
  entry,
  open,
  tab,
  onTabChange,
  onOpenChange,
  project,
  server,
  logs,
  linearWorkspace,
  busy,
  gitBusy,
  running,
  onRun,
  onStop,
  onCheckout,
  onPull,
}: {
  entry: Entry | null;
  open: boolean;
  tab: string;
  onTabChange: (t: string) => void;
  onOpenChange: (o: boolean) => void;
  project: ProjectSummary;
  server: RunningServer | null;
  logs: LogLine[];
  linearWorkspace: string;
  busy: boolean;
  gitBusy: boolean;
  running: boolean;
  onRun: () => void;
  onStop: () => void;
  onCheckout?: () => void;
  onPull?: () => void;
}) {
  const ref = entry?.branchName ?? undefined;
  const cwd = entry?.kind === "worktree" ? (entry.cwd ?? undefined) : undefined;
  const commits = useCommits(project.name, ref, cwd, open && !!entry);
  const gitlab = useGitlabOverview(project.name);
  const glConnected = gitlab.data?.connected ?? false;

  const TypeIcon = entry?.kind === "worktree" ? FolderTree : GitBranch;
  const dir = entry?.cwd ?? project.path;
  const serverUrl = running ? findServerUrl(logs) : null;

  const openIn = async (target: OpenTarget) => {
    try {
      await api.openIn(project.name, target, { cwd: entry?.cwd ?? project.path });
    } catch (err) {
      toast.error(String(err));
    }
  };

  // Environment needs a concrete working directory: a worktree, the checked-out
  // branch, or the currently-running server's dir.
  const canEnv = !!entry && (!!entry.cwd || entry.current || running);
  // Logs are available while running OR when a server ran and left output behind
  // (so a crash — e.g. "command not found" — is inspectable, not hidden).
  const canLogs = running || logs.length > 0;

  // Never leave a now-disabled tab active.
  useEffect(() => {
    if (!open) return;
    if ((tab === "logs" && !canLogs) || (tab === "env" && !canEnv) || (tab === "gitlab" && !glConnected))
      onTabChange("overview");
  }, [open, tab, canLogs, canEnv, glConnected, onTabChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[600px] max-w-[94vw] flex-col gap-0 p-0 sm:max-w-[600px]">
        {entry && (
          <>
            <SheetHeader className="gap-1.5 border-b border-border px-5 py-4">
              <SheetTitle className="flex min-w-0 items-center gap-2">
                <TypeIcon
                  className={cn(
                    "size-4 shrink-0",
                    entry.kind === "worktree"
                      ? "text-violet-500 dark:text-violet-400"
                      : "text-sky-500 dark:text-sky-400",
                  )}
                />
                <span className="truncate font-mono">{entry.name}</span>
                {entry.current && (
                  <Badge className="shrink-0 border-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3" /> current
                  </Badge>
                )}
                {entry.dirty && (
                  <Badge
                    title="Uncommitted changes"
                    className="shrink-0 gap-1 border-0 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  >
                    ● uncommitted
                  </Badge>
                )}
                {entry.remoteOnly && (
                  <Badge className="shrink-0 gap-1 border-0 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                    <Cloud className="size-3" /> remote
                  </Badge>
                )}
                {running && (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="size-2 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_6px_0] shadow-emerald-500/60" />
                    running
                  </span>
                )}
              </SheetTitle>
              <SheetDescription className="truncate font-mono text-xs">{dir}</SheetDescription>
            </SheetHeader>

            <Tabs value={tab} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col gap-0">
              <div className="border-b border-border px-5">
                <TabsList variant="line" className="h-10">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger
                    value="env"
                    disabled={!canEnv}
                    title={canEnv ? undefined : "Check out this branch (or start its server) to edit its environment"}
                  >
                    Environment
                  </TabsTrigger>
                  <TabsTrigger
                    value="logs"
                    disabled={!canLogs}
                    title={canLogs ? undefined : "Start the dev server to see logs"}
                  >
                    Logs
                  </TabsTrigger>
                  {glConnected && (
                    <TabsTrigger value="gitlab" className="gap-1.5">
                      <GitLabLogo className="size-3.5" /> GitLab
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>

              <TabsContent value="overview" className="flex-1 overflow-y-auto custom-scroll p-5 mt-0">
                <div className="flex flex-col gap-5">
                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {running ? (
                      <Button size="sm" variant="destructive" disabled={busy} onClick={onStop}>
                        <Square className="size-3.5" /> Stop server
                      </Button>
                    ) : (
                      <Button size="sm" disabled={busy} onClick={onRun}>
                        <Play className="size-3.5" /> {entry.cwd ? "Start dev server" : "Check out & run"}
                      </Button>
                    )}
                    {onCheckout && (
                      <Button size="sm" variant="outline" disabled={gitBusy || busy} onClick={onCheckout}>
                        <ArrowLeftRight className="size-3.5" /> Checkout
                      </Button>
                    )}
                    {onPull && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={gitBusy}
                        className="text-amber-600 dark:text-amber-400"
                        title="Pull from the remote (reports 'up to date' if there's nothing new)"
                        onClick={onPull}
                      >
                        <DownloadCloud className="size-3.5" /> Pull{entry.behind > 0 ? ` ↓${entry.behind}` : ""}
                      </Button>
                    )}
                    <OpenMenu
                      onPick={openIn}
                      align="start"
                      trigger={
                        <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent">
                          <ExternalLink className="size-3.5" /> Open
                        </button>
                      }
                    />
                  </div>

                  {serverUrl && (
                    <a
                      href={serverUrl}
                      onClick={(e) => {
                        e.preventDefault();
                        api.openIn(project.name, "url", { url: serverUrl }).catch((err) => toast.error(String(err)));
                      }}
                      className="flex items-center gap-2 rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-3 py-2 text-sm text-[var(--success)] transition-colors hover:bg-[var(--success)]/15"
                    >
                      <ExternalLink className="size-4 shrink-0" />
                      <span className="font-mono">{serverUrl}</span>
                      <span className="ml-auto text-xs opacity-80">open in browser</span>
                    </a>
                  )}

                  {/* Details */}
                  <div className="rounded-lg border border-border divide-y divide-border px-3">
                    <Detail label="Type">{entry.kind === "worktree" ? "Worktree" : "Branch"}</Detail>
                    {entry.branchName && <Detail label="Branch">{entry.branchName}</Detail>}
                    {entry.cwd && <Detail label="Path">{entry.cwd}</Detail>}
                    {entry.head && <Detail label="HEAD">{entry.head}</Detail>}
                    <Detail label="Author">{entry.author ?? "—"}</Detail>
                    <Detail label="Last commit">
                      {entry.ts ? new Date(entry.ts * 1000).toLocaleString() : "—"}
                    </Detail>
                    <Detail label="Upstream">
                      {entry.upstream ? (
                        <span>
                          {entry.upstream}
                          {(entry.behind > 0 || entry.kind === "branch") && (
                            <span className="ml-2 text-muted-foreground">
                              {entry.behind > 0 ? `↓${entry.behind}` : "up to date"}
                            </span>
                          )}
                        </span>
                      ) : (
                        "local only"
                      )}
                    </Detail>
                    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
                      <span className="text-muted-foreground">Flags</span>
                      <span className="flex flex-wrap justify-end gap-1">
                        {entry.isMain && <Badge variant="secondary">main</Badge>}
                        {entry.inWorktree && <Badge variant="secondary">in worktree</Badge>}
                        {entry.locked && <Badge variant="outline">locked</Badge>}
                        {!entry.isMain && !entry.inWorktree && !entry.locked && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    </div>
                    {entry.linearId && linearWorkspace && (
                      <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
                        <span className="text-muted-foreground">Linear</span>
                        <LinearLink id={entry.linearId} workspace={linearWorkspace} />
                      </div>
                    )}
                  </div>

                  {/* Commit heatmap */}
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Commit activity
                    </h3>
                    {commits.isPending ? (
                      <Skeleton className="h-24 w-full rounded-md" />
                    ) : (
                      <CommitHeatmap timestamps={commits.data?.timestamps ?? []} />
                    )}
                    <p className="text-xs text-muted-foreground">
                      {(commits.data?.timestamps.length ?? 0).toLocaleString()} commits in the last 6 months
                    </p>
                  </div>
                </div>
              </TabsContent>

              {glConnected && (
                <TabsContent value="gitlab" className="flex-1 overflow-y-auto custom-scroll p-5 mt-0">
                  <GitlabSection
                    key={entry.id}
                    project={project.name}
                    branch={entry.branchName}
                    defaultTarget={project.currentBranch ?? "main"}
                  />
                </TabsContent>
              )}

              <TabsContent value="env" className="flex-1 overflow-y-auto custom-scroll p-5 mt-0">
                <EnvTab
                  key={entry.id}
                  project={project}
                  server={server}
                  defaultCwd={entry.cwd ?? project.path}
                  lockDirectory
                />
              </TabsContent>

              <TabsContent value="logs" className="flex-1 overflow-hidden p-5 mt-0">
                <LogsTab project={project} server={server} logs={logs} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
