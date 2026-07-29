import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { AgentDot, UnreadPill } from "./AgentDot.tsx";
import { filterEntities, type ProjectEntity } from "../lib/projectEntities.ts";

const MAX_ROWS = 10;

/** Local relative-time label — mirrors OverviewTab's relTime but adds the two special cases
 * projectEntities produces: ts===0 (no activity to show) and ts===MAX_SAFE_INTEGER (an agent
 * is actively working, floated to the top — always "now"). lastCommitTs/createdAt are unix
 * seconds, matching the rest of the app (see OverviewTab.relTime). */
function relativeLabel(ts: number): string {
  if (ts === 0) return "";
  if (ts === Number.MAX_SAFE_INTEGER) return "now";
  const diffSec = Date.now() / 1000 - ts;
  const m = Math.floor(diffSec / 60);
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

function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
    >
      {children}
    </button>
  );
}

function ViewAllRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      View all
      <ArrowRight className="size-3" />
    </button>
  );
}

function GroupLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2 pt-2 pb-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>
      {action}
    </div>
  );
}

export interface SidebarRecentProps {
  features: ProjectEntity[];
  /** Task forces for the project, joined to their feature via `featureId` — grouped here so
   * expanding a Features row can list its task forces inline. */
  taskForces: ProjectEntity[];
  worktrees: ProjectEntity[];
  branches: ProjectEntity[];
  unreadFor: (featureId: string) => number;
  onOpenFeature: (featureId: string) => void;
  onOpenTaskForce: (featureId: string, taskForceId: string) => void;
  onOpenBranch: (name: string) => void;
  onOpenWorktree: (e: ProjectEntity) => void;
  onViewAll: (kind: "features" | "branches" | "worktrees") => void;
  /** Fetches all remotes (git fetch --all --prune) for the active project — surfaced as a
   * small action in the Worktrees group header (where `OverviewTab`'s Fetch button used to
   * live). Omitted entirely when there's nothing to fetch for (no project selected). */
  onFetch?: () => Promise<void> | void;
}

/** Sidebar "recent 10" lists for the active project — Features / Worktrees / Branches, each
 * already sorted by last activity (App builds the entities via buildProjectEntities). Purely
 * presentational: takes entities + callbacks, owns only the local filter-box text and each
 * feature row's expand/collapse state. */
export function SidebarRecent({
  features,
  taskForces,
  worktrees,
  branches,
  unreadFor,
  onOpenFeature,
  onOpenTaskForce,
  onOpenBranch,
  onOpenWorktree,
  onViewAll,
  onFetch,
}: SidebarRecentProps) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [fetching, setFetching] = useState(false);

  const filteredFeatures = filterEntities(features, q);
  const filteredWorktrees = filterEntities(worktrees, q);
  const filteredBranches = filterEntities(branches, q);

  const taskForcesByFeature = useMemo(() => {
    const m = new Map<string, ProjectEntity[]>();
    for (const tf of taskForces) {
      if (!tf.featureId) continue;
      const list = m.get(tf.featureId);
      if (list) list.push(tf);
      else m.set(tf.featureId, [tf]);
    }
    return m;
  }, [taskForces]);

  const toggleExpanded = (featureId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(featureId)) next.delete(featureId);
      else next.add(featureId);
      return next;
    });
  };

  const handleFetch = async () => {
    if (!onFetch) return;
    setFetching(true);
    try {
      await onFetch();
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 px-2 pt-1">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a feature, worktree, branch…"
        aria-label="Find a feature, worktree, or branch"
        className="h-8 text-sm"
      />
      <div className="min-h-0 flex-1 overflow-y-auto custom-scroll">
        <GroupLabel>Features</GroupLabel>
        {filteredFeatures.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">No features.</p>
        ) : (
          filteredFeatures.slice(0, MAX_ROWS).map((entity) => {
            const featureId = entity.featureId ?? entity.id;
            const isExpanded = expanded.has(featureId);
            const forces = taskForcesByFeature.get(featureId) ?? [];
            return (
              <div key={entity.id}>
                <button
                  type="button"
                  onClick={() => {
                    toggleExpanded(featureId);
                    onOpenFeature(featureId);
                  }}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <AgentDot status={entity.status} />
                  <span className="min-w-0 flex-1 truncate">{entity.label}</span>
                  <UnreadPill count={unreadFor(featureId)} />
                </button>
                {isExpanded && (
                  <div className="ml-4 flex flex-col border-l border-border pl-2">
                    {forces.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-muted-foreground">No task forces.</p>
                    ) : (
                      forces.map((tf) => (
                        <Row
                          key={tf.id}
                          onClick={() => onOpenTaskForce(tf.featureId!, tf.taskForceId!)}
                        >
                          <AgentDot status={tf.status} />
                          <span className="min-w-0 flex-1 truncate">{tf.label}</span>
                          {tf.branch && (
                            <span className="shrink-0 truncate font-mono text-xs text-muted-foreground">
                              {tf.branch}
                            </span>
                          )}
                        </Row>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        {filteredFeatures.length > MAX_ROWS && <ViewAllRow onClick={() => onViewAll("features")} />}

        <GroupLabel
          action={
            onFetch && (
              <button
                type="button"
                onClick={handleFetch}
                disabled={fetching}
                aria-label="Fetch remote"
                title="Fetch all remotes (git fetch --all --prune)"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
              >
                <RefreshCw className={cn("size-3.5", fetching && "animate-spin")} />
              </button>
            )
          }
        >
          Worktrees
        </GroupLabel>
        {filteredWorktrees.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">No worktrees.</p>
        ) : (
          filteredWorktrees.slice(0, MAX_ROWS).map((entity) => {
            const time = relativeLabel(entity.ts);
            const routesToTaskForce = !!(entity.taskForceId && entity.featureId);
            return (
              <Row
                key={entity.id}
                onClick={() =>
                  routesToTaskForce
                    ? onOpenTaskForce(entity.featureId!, entity.taskForceId!)
                    : onOpenWorktree(entity)
                }
              >
                {routesToTaskForce && <AgentDot status={entity.status} />}
                <span className="min-w-0 flex-1 truncate">{entity.label}</span>
                {entity.branch && (
                  <span className="shrink-0 truncate font-mono text-xs text-muted-foreground">
                    {entity.branch}
                  </span>
                )}
                {time && <span className="shrink-0 text-xs text-muted-foreground">{time}</span>}
              </Row>
            );
          })
        )}
        {filteredWorktrees.length > MAX_ROWS && <ViewAllRow onClick={() => onViewAll("worktrees")} />}

        <GroupLabel>Branches</GroupLabel>
        {filteredBranches.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">No branches.</p>
        ) : (
          filteredBranches.slice(0, MAX_ROWS).map((entity) => {
            const time = relativeLabel(entity.ts);
            return (
              <Row key={entity.id} onClick={() => onOpenBranch(entity.label)}>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-mono text-xs",
                    entity.isCurrent && "font-semibold text-foreground",
                  )}
                >
                  {entity.label}
                </span>
                {time && <span className="shrink-0 text-xs text-muted-foreground">{time}</span>}
              </Row>
            );
          })
        )}
        {filteredBranches.length > MAX_ROWS && <ViewAllRow onClick={() => onViewAll("branches")} />}
      </div>
    </div>
  );
}
