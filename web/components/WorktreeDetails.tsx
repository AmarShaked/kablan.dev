import { useMemo, useState } from "react";
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
  Package,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { api, type RunningServer, type ProjectSummary, type LogLine } from "../api.ts";
import { useGitlabOverview, useDiff } from "../queries.ts";
import type { Entry } from "../lib/entries.ts";
import { GitlabSection } from "./GitlabSection.tsx";
import { UnifiedDiffView } from "./UnifiedDiffView.tsx";
import { OpenMenu } from "./OpenMenu.tsx";
import { EnvTab } from "./EnvTab.tsx";
import { LinearLink } from "./LinearLink.tsx";
import { LogsTab } from "./LogsTab.tsx";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { OpenTarget } from "../api.ts";

/** A plain label/value row — moved here from the retired `ItemDrawer.tsx` (its only remaining
 * caller). */
const basename = (p: string) => p.split("/").filter(Boolean).pop() ?? p;

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-mono">{children}</span>
    </div>
  );
}

/** Turns a unified diff into a one-line "+N -M across F files" summary shown in the card header,
 * beside the mode toggle. The full per-file diff is rendered below it by `UnifiedDiffView`. */
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

/** One bordered card, matching the vertically-scrolling-column layout from the mockup.
 * `actions`, when given, is rendered right-aligned in the header row (e.g. the Working
 * diff card's mode toggle + Refresh button). */
function Card({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {actions}
      </div>
      {children}
    </div>
  );
}

/**
 * Inline details panel for the worktree cockpit (`Cockpit.tsx`) — a single scrolling column of
 * bordered cards (NOT a Sheet/tabs, per the mockup): `Detail` above, plus `OpenMenu`, `EnvTab`.
 * The GitLab (`GitlabSection`) and Linear (`LinearLink`) integrations live under the dedicated
 * `view === "integrations"` tab, which lazy-fetches their data only while active.
 *
 * `server`/`url`/`busy` and the dev-server callbacks are supplied by the caller (`Cockpit`) —
 * this component is purely presentational for the dev server.
 *
 * Guards gracefully when `entry.cwd` is null (a bare branch with no worktree yet): renders the
 * branch meta, but disables the dev-server and Env cards with a hint instead of the usual
 * controls.
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
  onInstall,
  otherRunningServers = [],
  onReplaceServer,
  linearWorkspace = "",
  logs = [],
  view = "details",
}: {
  project: string;
  entry: Entry;
  server: RunningServer | null;
  url: string | null;
  busy: boolean;
  onStartServer: () => void;
  onStopServer: () => void;
  /** Run `npm install` in this worktree (fixes a stale/missing node_modules). */
  onInstall?: () => void;
  /** Dev servers running on OTHER working copies of this same project (different branch/cwd). A
   * project's dev server holds one port, so only one branch can run it — these enable "replace". */
  otherRunningServers?: RunningServer[];
  /** Stop the dev server on `otherCwd` (another branch) and start one here instead. */
  onReplaceServer?: (otherCwd: string) => void;
  linearWorkspace?: string;
  logs?: LogLine[];
  /** Which right-pane view to render — driven by the cockpit header's tabs. Details is the
   * cards column; environment/logs each fill the pane with their single editor/stream. */
  view?: "details" | "environment" | "integrations" | "logs";
}) {
  const hasWorktree = !!entry.cwd;
  const running = server?.status === "running" || server?.status === "starting";
  // `installDeps` reuses the dev-server slot with an `npm install` command, so a running process
  // whose command is an install is an install-in-progress — surfaced distinctly from a dev server.
  const installing = running && (server?.command ?? "").includes("install");

  // Working-diff modes: "working" is the uncommitted working-tree diff; "base" is
  // everything this branch introduced vs its source branch (`git diff <base>...HEAD`,
  // handled server-side via the `against` param). Base defaults to "main" when the
  // entry doesn't carry one.
  const baseBranch = entry.baseBranch || "main";
  const [diffMode, setDiffMode] = useState<"working" | "base">("working");
  const against = diffMode === "base" ? baseBranch : undefined;
  const diff = useDiff(project, undefined, entry.cwd ?? undefined, hasWorktree, against);
  const diffSummary = useMemo(
    () => (diff.data ? summarizeDiff(diff.data.diff) : null),
    [diff.data],
  );
  // Lazy: only fetch GitLab (and, since GitlabSection only mounts inside the integrations
  // branch, its own internal queries) when the Integrations tab is actually active.
  const gitlab = useGitlabOverview(project, view === "integrations");
  const glConnected = gitlab.data?.connected ?? false;

  // Env needs a concrete working directory — mirrors ItemDrawer's `canEnv` (minus the
  // "running server" leg, since a running server implies a cwd here already).
  const canEnv = hasWorktree || entry.current;
  // A synthetic ProjectSummary for EnvTab, which only reads `.name`/`.path` off it — Cockpit
  // only carries a project *name* (like Cockpit itself), not a full ProjectSummary.
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

  if (view === "environment") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scroll p-4">
        {canEnv ? (
          <EnvTab key={entry.id} project={envProject} server={server} defaultCwd={entry.cwd ?? undefined} lockDirectory />
        ) : (
          <p className="text-sm text-muted-foreground">
            Start a session for this branch (or check it out) to edit its environment.
          </p>
        )}
      </div>
    );
  }

  if (view === "logs") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        {hasWorktree ? (
          <LogsTab project={envProject} server={server} logs={logs} />
        ) : (
          <p className="text-sm text-muted-foreground">Start a session for this branch to see dev-server logs.</p>
        )}
      </div>
    );
  }

  if (view === "integrations") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto custom-scroll p-4">
        {/* GitLab */}
        <Card title="GitLab">
          {gitlab.isPending ? (
            <Skeleton className="h-6 w-2/3 rounded-md" />
          ) : glConnected ? (
            <GitlabSection key={entry.id} project={project} branch={entry.branchName} defaultTarget={entry.baseBranch ?? "main"} />
          ) : (
            <p className="text-xs text-muted-foreground">GitLab isn't connected for this project.</p>
          )}
        </Card>

        {/* Linear */}
        <Card title="Linear">
          {entry.linearId && linearWorkspace ? (
            <div className="flex">
              <LinearLink id={entry.linearId} workspace={linearWorkspace} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No linked Linear issue.</p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto custom-scroll p-4">
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
                className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ExternalLink className="size-3.5" /> Open
              </button>
            }
          />
        </div>
      </Card>

      {/* Dev server */}
      <Card title="Dev server">
        {hasWorktree ? (
          <>
            <div className="flex flex-wrap gap-2">
              {installing ? (
                <Button size="xs" variant="destructive" disabled={busy} onClick={onStopServer}>
                  <Square className="size-3.5" /> Stop install
                </Button>
              ) : running ? (
                <Button size="xs" variant="destructive" disabled={busy} onClick={onStopServer}>
                  <Square className="size-3.5" /> Stop server
                </Button>
              ) : otherRunningServers.length > 0 ? (
                // Split button: primary "Start server" (unchanged) + a caret opening a menu to
                // instead REPLACE a dev server running on another branch (which holds the port).
                <div className="flex">
                  <Button
                    size="xs"
                    disabled={busy}
                    onClick={onStartServer}
                    className="rounded-r-none"
                  >
                    <Play className="size-3.5" /> Start server
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      {/* Native <button> (not the shadcn <Button>): DropdownMenuTrigger `asChild`
                          must attach a ref to anchor the menu, and this project's React-18 <Button>
                          isn't a forwardRef component, so a ref never lands on it and the menu can't
                          open. A native element accepts the ref — matching how OpenMenu/ProjectSwitcher
                          wire their asChild triggers. */}
                      <button
                        type="button"
                        disabled={busy}
                        aria-label="Replace a dev server running on another branch"
                        className={cn(
                          buttonVariants({ size: "xs", variant: "outline" }),
                          "rounded-l-none border-l-0 px-2",
                        )}
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {otherRunningServers.map((s) => {
                        const label = s.branch ?? basename(s.cwd);
                        return (
                          <DropdownMenuItem key={s.cwd} onSelect={() => onReplaceServer?.(s.cwd)}>
                            Replace: stop {label} &amp; start here
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : (
                <Button size="xs" disabled={busy} onClick={onStartServer}>
                  <Play className="size-3.5" /> Start server
                </Button>
              )}
              {onInstall && !running && (
                <Button size="xs" variant="outline" disabled={busy} onClick={onInstall}>
                  <Package className="size-3.5" /> Install deps
                </Button>
              )}
            </div>
            {installing && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <RefreshCw className="size-3 animate-spin" /> Installing dependencies… (output in Logs)
              </p>
            )}
            {!running && otherRunningServers.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3 shrink-0" /> A dev server is running on{" "}
                <span className="font-mono">{otherRunningServers[0].branch ?? basename(otherRunningServers[0].cwd)}</span>{" "}
                (same project/port).
              </p>
            )}
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

      {/* Working diff */}
      <Card
        title="Working diff"
        actions={
          hasWorktree ? (
            <div className="flex items-center gap-1">
              <div className="flex overflow-hidden rounded-md border border-border">
                <button
                  onClick={() => setDiffMode("working")}
                  aria-pressed={diffMode === "working"}
                  className={cn(
                    "px-2 py-0.5 text-xs transition-colors",
                    diffMode === "working"
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  Uncommitted
                </button>
                <button
                  onClick={() => setDiffMode("base")}
                  aria-pressed={diffMode === "base"}
                  className={cn(
                    "border-l border-border px-2 py-0.5 text-xs transition-colors",
                    diffMode === "base"
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  vs {baseBranch}
                </button>
              </div>
              <button
                onClick={() => diff.refetch()}
                aria-label="Refresh diff"
                title="Refresh diff"
                className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <RefreshCw className={cn("size-3.5", diff.isFetching && "animate-spin")} />
              </button>
            </div>
          ) : undefined
        }
      >
        {!hasWorktree ? (
          <p className="text-xs text-muted-foreground">Start a session for this branch to see its working diff.</p>
        ) : diff.isPending ? (
          <Skeleton className="h-6 w-2/3 rounded-md" />
        ) : diffSummary && diffSummary.files > 0 ? (
          <>
            <p className="font-mono text-xs">
              {diffSummary.files} file{diffSummary.files === 1 ? "" : "s"} changed ·{" "}
              <span className="text-[var(--success)]">+{diffSummary.added}</span>{" "}
              <span className="text-destructive">-{diffSummary.removed}</span>
            </p>
            {/* The parsed per-file diff. Caps its own height and scrolls internally so a huge diff
             * doesn't swallow the whole details column. */}
            <div className="max-h-[70vh] overflow-y-auto custom-scroll">
              <UnifiedDiffView diff={diff.data?.diff ?? ""} />
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {diffMode === "base"
              ? `No changes vs ${baseBranch}.`
              : "No uncommitted changes — this branch's committed work shows under “vs " +
                baseBranch +
                "”."}
          </p>
        )}
      </Card>
    </div>
  );
}
