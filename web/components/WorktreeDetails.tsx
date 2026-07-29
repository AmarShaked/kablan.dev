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
import { api, type RunningServer, type ProjectSummary } from "../api.ts";
import { useCommits, useGitlabOverview, useDiff } from "../queries.ts";
import type { Entry } from "../lib/entries.ts";
import { GitlabSection } from "./GitlabSection.tsx";
import { CommitHeatmap, Detail } from "./ItemDrawer.tsx";
import { OpenMenu } from "./OpenMenu.tsx";
import { EnvTab } from "./EnvTab.tsx";
import { LinearLink } from "./LinearLink.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { OpenTarget } from "../api.ts";

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
 * bordered cards (NOT a Sheet/tabs, per the mockup), reusing the same sub-components
 * `ItemDrawer` uses: `CommitHeatmap`/`Detail` (exported from `ItemDrawer.tsx`), `OpenMenu`,
 * `EnvTab`, `GitlabSection`, `LinearLink`, `useCommits`.
 *
 * `server`/`url`/`busy` and the dev-server callbacks are supplied by the caller (`Cockpit`) —
 * this component is purely presentational for the dev server, same division of labor as
 * `ItemDrawer` (which also receives `server`/`logs`/`busy`/`onRun`/`onStop` from its parent).
 *
 * Guards gracefully when `entry.cwd` is null (a bare branch with no worktree yet): renders the
 * branch meta + commit history, but disables the dev-server and Env cards with a hint instead
 * of the usual controls.
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
