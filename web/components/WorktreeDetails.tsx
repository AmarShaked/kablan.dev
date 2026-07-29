import { useMemo } from "react";
import { toast } from "sonner";
import {
  FolderTree,
  GitBranch,
  Play,
  Square,
  RefreshCw,
  Check,
  Cloud,
  ExternalLink,
} from "lucide-react";
import { api, type RunningServer, type ProjectSummary, type LogLine } from "../api.ts";
import { useCommits, useGitlabOverview, useDiff } from "../queries.ts";
import type { Entry } from "../lib/entries.ts";
import { GitlabSection } from "./GitlabSection.tsx";
import { OpenMenu } from "./OpenMenu.tsx";
import { EnvTab } from "./EnvTab.tsx";
import { LinearLink } from "./LinearLink.tsx";
import { LogsTab } from "./LogsTab.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { OpenTarget } from "../api.ts";

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

/** Commit-activity heatmap — originally defined in the retired `ItemDrawer.tsx`, moved here
 * (its only remaining caller) rather than resurrecting that file. */
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

/** A plain label/value row — moved here from the retired `ItemDrawer.tsx` (its only remaining
 * caller). */
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-mono">{children}</span>
    </div>
  );
}

/** Turns a unified diff into a one-line "+N -M across F files" summary. Good enough for a
 * summary card — the full diff isn't rendered here (no diff viewer exists elsewhere yet either;
 * see `useDiff` in `../queries.ts`, previously unused). */
function summarizeDiff(diff: string): { files: number; added: number; removed: number } {
  let files = 0;
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) files++;
    else if (line.startsWith("+++") || line.startsWith("---")) continue;
    else if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { files, added, removed };
}

/** One bordered card, matching the vertically-scrolling-column layout from the mockup. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

/**
 * Inline details panel for the worktree cockpit (`Cockpit.tsx`) — a single scrolling column of
 * bordered cards (NOT a Sheet/tabs, per the mockup): `CommitHeatmap`/`Detail` above, plus
 * `OpenMenu`, `EnvTab`, `GitlabSection`, `LinearLink`, `useCommits`.
 *
 * `server`/`url`/`busy` and the dev-server callbacks are supplied by the caller (`Cockpit`) —
 * this component is purely presentational for the dev server.
 *
 * Guards gracefully when `entry.cwd` is null (a bare branch with no worktree yet): renders the
 * branch meta + commit history, but disables the dev-server and Env cards with a hint instead
 * of the usual controls.
 *
 * `logs` (I3): the project's dev-server output, captured by `App`'s WS "log"-frame handler and
 * threaded down through `Cockpit` — rendered here via the pre-existing `LogsTab` (orphaned by
 * the `ItemDrawer`/`OverviewTab` removal, now given a home again) so the crash toast's "Open the
 * cockpit's Logs card for details" has somewhere to actually point.
 */
export function WorktreeDetails({
  project,
  entry,
  server,
  url,
  busy,
  onStartServer,
  onStopServer,
  onRefreshServer,
  linearWorkspace = "",
  logs = [],
}: {
  project: string;
  entry: Entry;
  server: RunningServer | null;
  url: string | null;
  busy: boolean;
  onStartServer: () => void;
  onStopServer: () => void;
  onRefreshServer?: () => void;
  linearWorkspace?: string;
  logs?: LogLine[];
}) {
  const hasWorktree = !!entry.cwd;
  const running = server?.status === "running" || server?.status === "starting";

  const commits = useCommits(project, entry.branchName ?? undefined, entry.cwd ?? undefined, true);
  const diff = useDiff(project, undefined, entry.cwd ?? undefined, hasWorktree);
  const diffSummary = useMemo(
    () => (diff.data ? summarizeDiff(diff.data.diff) : null),
    [diff.data],
  );
  const gitlab = useGitlabOverview(project);
  const glConnected = gitlab.data?.connected ?? false;

  // Env needs a concrete working directory — mirrors ItemDrawer's `canEnv` (minus the
  // "running server" leg, since a running server implies a cwd here already).
  const canEnv = hasWorktree || entry.current;
  // A synthetic ProjectSummary for EnvTab, which only reads `.name`/`.path` off it — Cockpit
  // only carries a project *name* (like TaskForceCockpit today), not a full ProjectSummary.
  const envProject: ProjectSummary = {
    name: project,
    path: entry.cwd ?? "",
    currentBranch: null,
    detectedCommand: null,
    devCommand: "",
    hasEnv: false,
    packageManager: "",
    lastCommitTs: null,
  };

  const TypeIcon = entry.kind === "worktree" ? FolderTree : GitBranch;

  const openIn = async (target: OpenTarget) => {
    try {
      await api.openIn(project, target, { cwd: entry.cwd ?? undefined });
    } catch (err) {
      toast.error(String(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 overflow-y-auto custom-scroll p-4">
      {/* Overview */}
      <Card title="Overview">
        <div className="flex flex-wrap items-center gap-1.5">
          <TypeIcon
            className={cn(
              "size-4 shrink-0",
              entry.kind === "worktree" ? "text-violet-500 dark:text-violet-400" : "text-sky-500 dark:text-sky-400",
            )}
          />
          <span className="truncate font-mono text-sm">{entry.branchName ?? entry.name}</span>
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
          {entry.behind > 0 && (
            <Badge className="shrink-0 border-0 bg-sky-500/15 text-sky-600 dark:text-sky-400">
              ↓{entry.behind}
            </Badge>
          )}
        </div>
        {entry.baseBranch && <Detail label="Base branch">{entry.baseBranch}</Detail>}
        <Detail label="Worktree path">{entry.cwd ?? "not checked out"}</Detail>
        {entry.upstream && <Detail label="Upstream">{entry.upstream}</Detail>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <OpenMenu
            onPick={openIn}
            align="start"
            trigger={
              <button
                disabled={!hasWorktree}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ExternalLink className="size-3.5" /> Open
              </button>
            }
          />
          {entry.linearId && linearWorkspace && <LinearLink id={entry.linearId} workspace={linearWorkspace} />}
        </div>
      </Card>

      {/* Dev server */}
      <Card title="Dev server">
        {hasWorktree ? (
          <>
            <div className="flex gap-2">
              {running ? (
                <Button size="sm" variant="destructive" disabled={busy} onClick={onStopServer}>
                  <Square className="size-3.5" /> Stop server
                </Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={onStartServer}>
                  <Play className="size-3.5" /> Start server
                </Button>
              )}
              {onRefreshServer && (
                <Button size="sm" variant="outline" disabled={busy} onClick={onRefreshServer}>
                  <RefreshCw className="size-3.5" /> Refresh
                </Button>
              )}
            </div>
            {url && (
              <a
                href={url}
                onClick={(ev) => {
                  ev.preventDefault();
                  api.openIn(project, "url", { url }).catch((err) => toast.error(String(err)));
                }}
                className="truncate font-mono text-xs text-[var(--success)] hover:underline"
              >
                {url}
              </a>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Start a session for this branch to run a dev server.</p>
        )}
      </Card>

      {/* Logs — the dev server's stdout/stderr, live-streamed via App's WS "log" frames plus
          whatever `api.getLogs` already had on record. Only one dev server runs per project at a
          time (see `server/processes.ts`), so `logs` (project-scoped) and `server` (this entry's
          cwd, already filtered by the caller) describe the same process here. */}
      {hasWorktree && (
        <Card title="Logs">
          <LogsTab project={envProject} server={server} logs={logs} />
        </Card>
      )}

      {/* Recent commits */}
      <Card title="Recent commits">
        {commits.isPending ? (
          <Skeleton className="h-24 w-full rounded-md" />
        ) : (
          <CommitHeatmap timestamps={commits.data?.timestamps ?? []} />
        )}
        <p className="text-xs text-muted-foreground">
          {(commits.data?.timestamps.length ?? 0).toLocaleString()} commits in the last 6 months
        </p>
      </Card>

      {/* Working diff summary */}
      <Card title="Working diff">
        {!hasWorktree ? (
          <p className="text-xs text-muted-foreground">Start a session for this branch to see its working diff.</p>
        ) : diff.isPending ? (
          <Skeleton className="h-6 w-2/3 rounded-md" />
        ) : diffSummary && diffSummary.files > 0 ? (
          <p className="font-mono text-xs">
            {diffSummary.files} file{diffSummary.files === 1 ? "" : "s"} changed ·{" "}
            <span className="text-[var(--success)]">+{diffSummary.added}</span>{" "}
            <span className="text-destructive">-{diffSummary.removed}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">No uncommitted changes.</p>
        )}
      </Card>

      {/* Env */}
      <Card title="Environment">
        {canEnv ? (
          <EnvTab key={entry.id} project={envProject} server={server} defaultCwd={entry.cwd ?? undefined} lockDirectory />
        ) : (
          <p className="text-xs text-muted-foreground">
            Start a session for this branch (or check it out) to edit its environment.
          </p>
        )}
      </Card>

      {/* GitLab */}
      {glConnected && (
        <Card title="GitLab">
          <GitlabSection key={entry.id} project={project} branch={entry.branchName} defaultTarget={entry.baseBranch ?? "main"} />
        </Card>
      )}
    </div>
  );
}
