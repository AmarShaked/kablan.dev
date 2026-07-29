import { useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, Boxes, GitBranch, MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AgentDot } from "./AgentDot.tsx";
import { type BranchEntity, type FeatureGroup } from "../lib/projectEntities.ts";

const MAX_ROWS = 10;
const SKELETON_ROWS = 4;

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

/** Placeholder row shown while a group's query is still pending — same height/padding/gap as
 * the real row (dot + text line + trailing time) so data arriving causes zero layout shift. */
function SkeletonRow({ group }: { group: "features" | "branches" }) {
  return (
    <div className="flex w-full items-center gap-2 px-2 py-1.5" data-testid={`skeleton-row-${group}`}>
      <Skeleton className="size-2 shrink-0 rounded-full" />
      <Skeleton className="h-3.5 min-w-0 flex-1" />
      <Skeleton className="h-3 w-8 shrink-0" />
    </div>
  );
}

function SkeletonGroup({ group }: { group: "features" | "branches" }) {
  return (
    <>
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <SkeletonRow key={i} group={group} />
      ))}
    </>
  );
}

/** Group header: a per-group accent icon + colored uppercase label + total count, so the two
 * sections (Features / Branches) read at a glance. Accent colors reuse the app's palette —
 * primary (features), sky (branches). */
function GroupLabel({
  icon: Icon,
  color,
  count,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-1 flex items-center gap-1.5 px-2 pt-2 pb-1">
      <Icon className={cn("size-3.5 shrink-0", color)} />
      <span className={cn("text-xs font-semibold uppercase tracking-wide", color)}>{children}</span>
      {typeof count === "number" && count > 0 && (
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

/** File/unfile affordance for one branch row: a "＋" for an unfiled branch (choose a feature to
 * file it into) or a "···" for a filed one (remove it from its feature). Hidden entirely when
 * there's nothing useful to offer (no features exist yet, and the branch isn't filed). Built
 * from Popover rather than the shadcn DropdownMenu primitive, matching `OpenMenu`'s pattern
 * elsewhere in the cockpit. */
function FileMenu({
  entity,
  features,
  onFileBranch,
  onUnfileBranch,
}: {
  entity: BranchEntity;
  features: { id: string; name: string }[];
  onFileBranch: (featureId: string, branch: string) => void;
  onUnfileBranch: (featureId: string, branch: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!entity.featureId && features.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={entity.featureId ? `Remove ${entity.name} from its feature` : `File ${entity.name} into a feature`}
          className={cn(
            "shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100",
            open && "opacity-100",
          )}
        >
          {entity.featureId ? <MoreHorizontal className="size-3.5" /> : <Plus className="size-3.5" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1" onClick={(e) => e.stopPropagation()}>
        {entity.featureId ? (
          <button
            type="button"
            onClick={() => {
              onUnfileBranch(entity.featureId!, entity.name);
              setOpen(false);
            }}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
          >
            Remove from feature
          </button>
        ) : (
          <>
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              File into
            </div>
            {features.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  onFileBranch(f.id, entity.name);
                  setOpen(false);
                }}
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
              >
                {f.name}
              </button>
            ))}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** One branch row: agent dot + a small green dot when its dev server is running + the branch
 * name (mono, bold when it's the repo's current branch) + relative time + the file/unfile
 * affordance. */
function BranchRow({
  entity,
  features,
  onOpenBranch,
  onFileBranch,
  onUnfileBranch,
}: {
  entity: BranchEntity;
  features: { id: string; name: string }[];
  onOpenBranch: (name: string) => void;
  onFileBranch: (featureId: string, branch: string) => void;
  onUnfileBranch: (featureId: string, branch: string) => void;
}) {
  const time = relativeLabel(entity.ts);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenBranch(entity.name)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenBranch(entity.name);
        }
      }}
      className="group flex w-full min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
    >
      <AgentDot status={entity.agentStatus} />
      {entity.serverRunning && (
        <span
          className="size-1.5 shrink-0 rounded-full bg-emerald-500"
          title="Dev server running"
          aria-label="Dev server running"
        />
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-xs",
          entity.isCurrent && "font-semibold text-foreground",
        )}
      >
        {entity.name}
      </span>
      {time && <span className="shrink-0 text-xs text-muted-foreground">{time}</span>}
      <FileMenu entity={entity} features={features} onFileBranch={onFileBranch} onUnfileBranch={onUnfileBranch} />
    </div>
  );
}

export interface SidebarRecentProps {
  featureGroups: FeatureGroup[];
  unfiled: BranchEntity[];
  onOpenBranch: (name: string) => void;
  onFileBranch: (featureId: string, branch: string) => void;
  onUnfileBranch: (featureId: string, branch: string) => void;
  onNewFeature: () => void;
  /** Fetches all remotes (git fetch --all --prune) for the active project — surfaced as a
   * small action in the Branches group header. Omitted entirely when there's nothing to fetch
   * for (no project selected). */
  onFetch?: () => Promise<void> | void;
  /** True while the respective query is still in flight. Only shows skeleton rows when there's
   * no data yet — a background refetch (stale-while-revalidate) keeps showing the real rows. */
  featuresLoading?: boolean;
  branchesLoading?: boolean;
}

/** Sidebar "recent" lists for the active project — Feature folders (each expands to its member
 * branches) plus a flat Branches group for unfiled ones. Every branch is exactly ONE row,
 * wherever it appears: `AgentDot` + a server dot + name + relative time + a file/unfile
 * affordance. Purely presentational: takes the grouped entities + callbacks, owns only the
 * local expand/collapse state per feature. */
export function SidebarRecent({
  featureGroups,
  unfiled,
  onOpenBranch,
  onFileBranch,
  onUnfileBranch,
  onNewFeature,
  onFetch,
  featuresLoading = false,
  branchesLoading = false,
}: SidebarRecentProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [fetching, setFetching] = useState(false);

  const features = featureGroups.map((g) => g.feature);

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
    <div className="flex min-h-0 flex-1 flex-col px-2 pt-2">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scroll">
        <GroupLabel
          icon={Boxes}
          color="text-primary"
          count={featureGroups.length}
          action={
            <button
              type="button"
              onClick={onNewFeature}
              aria-label="New feature"
              title="New feature"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </button>
          }
        >
          Features
        </GroupLabel>
        {featuresLoading && featureGroups.length === 0 ? (
          <SkeletonGroup group="features" />
        ) : featureGroups.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">No features.</p>
        ) : (
          featureGroups.slice(0, MAX_ROWS).map(({ feature, branches }) => {
            const isExpanded = expanded.has(feature.id);
            return (
              <div key={feature.id}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(feature.id)}
                  aria-label={isExpanded ? `Collapse ${feature.name}` : `Expand ${feature.name}`}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{feature.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {branches.length} branch{branches.length === 1 ? "" : "es"}
                  </span>
                </button>
                {isExpanded && (
                  <div className="ml-4 flex flex-col border-l border-border pl-2">
                    {branches.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-muted-foreground">No branches yet.</p>
                    ) : (
                      branches.map((entity) => (
                        <BranchRow
                          key={entity.name}
                          entity={entity}
                          features={features}
                          onOpenBranch={onOpenBranch}
                          onFileBranch={onFileBranch}
                          onUnfileBranch={onUnfileBranch}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        <GroupLabel
          icon={GitBranch}
          color="text-sky-400"
          count={unfiled.length}
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
          Branches
        </GroupLabel>
        {branchesLoading && unfiled.length === 0 ? (
          <SkeletonGroup group="branches" />
        ) : unfiled.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">No branches.</p>
        ) : (
          unfiled
            .slice(0, MAX_ROWS)
            .map((entity) => (
              <BranchRow
                key={entity.name}
                entity={entity}
                features={features}
                onOpenBranch={onOpenBranch}
                onFileBranch={onFileBranch}
                onUnfileBranch={onUnfileBranch}
              />
            ))
        )}
      </div>
    </div>
  );
}
