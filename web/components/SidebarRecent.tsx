import { useState } from "react";
import { ArrowRight } from "lucide-react";
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

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

export interface SidebarRecentProps {
  features: ProjectEntity[];
  worktrees: ProjectEntity[];
  branches: ProjectEntity[];
  unreadFor: (featureId: string) => number;
  onOpenFeature: (featureId: string) => void;
  onOpenTaskForce: (featureId: string, taskForceId: string) => void;
  onOpenBranch: (name: string) => void;
  onOpenWorktree: (e: ProjectEntity) => void;
  onViewAll: (kind: "features" | "branches" | "worktrees") => void;
}

/** Sidebar "recent 10" lists for the active project — Features / Worktrees / Branches, each
 * already sorted by last activity (App builds the entities via buildProjectEntities). Purely
 * presentational: takes entities + callbacks, owns only the local filter-box text. */
export function SidebarRecent({
  features,
  worktrees,
  branches,
  unreadFor,
  onOpenFeature,
  onOpenTaskForce,
  onOpenBranch,
  onOpenWorktree,
  onViewAll,
}: SidebarRecentProps) {
  const [q, setQ] = useState("");

  const filteredFeatures = filterEntities(features, q);
  const filteredWorktrees = filterEntities(worktrees, q);
  const filteredBranches = filterEntities(branches, q);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 px-2 pt-1">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter…"
        aria-label="Filter recent"
        className="h-8 text-sm"
      />
      <div className="min-h-0 flex-1 overflow-y-auto custom-scroll">
        <GroupLabel>Features</GroupLabel>
        {filteredFeatures.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">No features.</p>
        ) : (
          filteredFeatures.slice(0, MAX_ROWS).map((entity) => (
            <Row key={entity.id} onClick={() => onOpenFeature(entity.featureId ?? entity.id)}>
              <AgentDot status={entity.status} />
              <span className="min-w-0 flex-1 truncate">{entity.label}</span>
              <UnreadPill count={unreadFor(entity.featureId ?? entity.id)} />
            </Row>
          ))
        )}
        {filteredFeatures.length > MAX_ROWS && <ViewAllRow onClick={() => onViewAll("features")} />}

        <GroupLabel>Worktrees</GroupLabel>
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
