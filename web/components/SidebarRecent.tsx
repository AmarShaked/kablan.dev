import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, Boxes, Folder, GitBranch, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AGENT_DOT_COLORS } from "./AgentDot.tsx";
import { FeatureIconButton } from "./FeatureIconButton.tsx";
import { type BranchEntity, type FeatureGroup } from "../lib/projectEntities.ts";
import { type AgentStatus } from "../api.ts";
import {
  reorderIds,
  dropSide,
  setBranchDragData,
  getBranchDragData,
  setFeatureDragData,
  getFeatureDragData,
} from "../lib/dnd.ts";

/** A fully transparent 1x1 GIF used as every drag's browser drag-image, so the only visible
 * "ghost" while dragging is our own floating chip (see `dragPos`/`dragging` below) rather than
 * the browser's default snapshot-of-the-row image. Built once at module scope; guarded for
 * environments with no `Image` (e.g. this file's own tests run under jsdom, which does have it,
 * but `setDragImage` itself is guarded separately since the tests' fake `DataTransfer` has no
 * such method). */
const TRANSPARENT_DRAG_IMAGE = (() => {
  if (typeof Image === "undefined") return undefined;
  const img = new Image();
  img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7";
  return img;
})();

function suppressDragImage(e: React.DragEvent<HTMLElement>) {
  if (TRANSPARENT_DRAG_IMAGE && e.dataTransfer.setDragImage) {
    e.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0);
  }
}

const MAX_ROWS = 10;
const SKELETON_ROWS = 4;

/**
 * Drag-and-drop design (native HTML5 `draggable`/`onDragStart`/`onDragOver`/`onDrop` — no
 * library): dragging a branch row onto a Feature folder (header or body) files it there;
 * dragging a filed branch onto the Branches group unfiles it; dropping a branch onto a sibling
 * *within the same feature* reorders (an insertion line shows above/below the hovered half of
 * the row); dragging a Feature folder's header onto another reorders the folders. The unfiled
 * Branches list has no manual order (it stays activity-sorted), so its rows are never a reorder
 * target — only a file/unfile one.
 *
 * `dragging` (what's being carried) and `dropTarget` (where it would land right now) are local
 * component state, used ONLY to drive the ring/insertion-line affordances during `dragover` —
 * per the DOM drag-and-drop spec, `dataTransfer.getData` reliably returns data only on `drop`
 * (browsers withhold it during `dragover` for cross-origin-drag security reasons), so the
 * *actual* file/unfile/reorder decision on `drop` always re-reads the dragged payload fresh out
 * of `event.dataTransfer` (see `dnd.ts`) rather than trusting this state. Every reorder/insertion
 * indicator is a plain background/border toggle with no transition, so there's nothing for
 * `prefers-reduced-motion` to need to suppress.
 */
type Dragging =
  | { kind: "branch"; branch: string; sourceFeatureId?: string }
  | { kind: "feature"; featureId: string };

type DropTarget =
  | { kind: "file"; featureId: string } // ring on a whole feature folder — filing target
  | { kind: "unfile" } // ring on the Branches group — unfile target
  | { kind: "branch"; featureId: string; index: number } // insertion line within a feature
  | { kind: "feature"; index: number }; // insertion line among feature folders

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

/** Per-row overflow menu: always offers "Rename" (set a friendly display title without renaming
 * the git branch); plus "Remove from feature" for a filed branch, or a "File into" feature list
 * for an unfiled one when features exist. The trigger's "＋" icon (unfiled, features available)
 * hints filing; otherwise a "···". Built from Popover rather than the shadcn DropdownMenu
 * primitive, matching `OpenMenu`'s pattern elsewhere in the cockpit. */
function FileMenu({
  entity,
  features,
  onFileBranch,
  onUnfileBranch,
  onRename,
}: {
  entity: BranchEntity;
  features: { id: string; name: string }[];
  onFileBranch: (featureId: string, branch: string) => void;
  onUnfileBranch: (featureId: string, branch: string) => void;
  /** Begins inline rename of this row (reveals the title input). */
  onRename: () => void;
}) {
  const [open, setOpen] = useState(false);
  const canFile = !entity.featureId && features.length > 0;
  // The trigger keeps its original filing/unfiling aria-label when that action is available (so
  // the "File …"/"Remove …" affordances stay discoverable); an unfiled branch with no features
  // to file into now still shows the menu (for Rename) under a neutral label.
  const triggerLabel = entity.featureId
    ? `Remove ${entity.name} from its feature`
    : canFile
      ? `File ${entity.name} into a feature`
      : "Branch options";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={triggerLabel}
          className={cn(
            "shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100",
            open && "opacity-100",
          )}
        >
          {canFile ? <Plus className="size-3.5" /> : <MoreHorizontal className="size-3.5" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => {
            onRename();
            setOpen(false);
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
        >
          <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
          Rename
        </button>
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
          canFile && (
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
          )
        )}
      </PopoverContent>
    </Popover>
  );
}

/** One branch row: agent dot + a small green dot when its dev server is running + the branch
 * name (mono, bold when it's the repo's current branch) + relative time + the file/unfile
 * affordance. */
/** Leading dot: a FILLED dot means the branch has a working copy (started / active); a hollow
 * ring means it's not started yet. Agent status (working/awaiting/…) colors the filled dot;
 * a started-but-idle branch is a solid neutral dot. */
function BranchDot({ hasWorktree, status }: { hasWorktree: boolean; status?: AgentStatus }) {
  if (!hasWorktree) {
    return (
      <span
        className="inline-block size-2 shrink-0 rounded-full border border-muted-foreground/40"
        title="Not started"
        aria-label="Not started"
      />
    );
  }
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", AGENT_DOT_COLORS[status ?? ""] ?? "bg-muted-foreground")}
      title={status ? `Working copy · ${status}` : "Working copy active"}
      aria-label="Working copy active"
    />
  );
}

function BranchRow({
  entity,
  features,
  onOpenBranch,
  onFileBranch,
  onUnfileBranch,
  onRenameBranch,
  onDragStart,
  onDragEnd,
  onRowDragOver,
  onRowDrop,
  dropBefore,
  dropAfter,
  active,
}: {
  entity: BranchEntity;
  features: { id: string; name: string }[];
  /** True when this branch's cockpit is the one currently open — highlights the row as selected. */
  active?: boolean;
  onOpenBranch: (name: string) => void;
  onFileBranch: (featureId: string, branch: string) => void;
  onUnfileBranch: (featureId: string, branch: string) => void;
  /** Commits a friendly display title for this branch (empty string clears it). */
  onRenameBranch: (branch: string, title: string) => void;
  /** Native HTML5 drag-and-drop wiring (see the module doc comment at the top of this file for
   * the overall design) — all four are always provided by the parent, fully bound to this row's
   * identity/position, so `BranchRow` itself stays presentational. */
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
  onRowDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onRowDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  /** Insertion-line affordance: true when a drop right now would land immediately
   * before/after this row (within the same feature — see `DropTarget`). No transition is
   * applied to these — they snap on/off instantly, so there's nothing for
   * `prefers-reduced-motion` to need to suppress. */
  dropBefore?: boolean;
  dropAfter?: boolean;
}) {
  const time = relativeLabel(entity.ts);
  // Inline rename: a title input replaces the label. Prefilled with the current title, or the
  // raw branch name as a starting point when there's no title yet. Enter or blur commits;
  // Escape cancels. An empty/whitespace value clears the title (server falls back to the name).
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const startRename = () => {
    setDraft(entity.title ?? entity.name);
    setRenaming(true);
  };
  const commitRename = () => {
    if (!renaming) return;
    setRenaming(false);
    const next = draft.trim();
    // Only round-trip to the server when it actually changed (avoids a redundant write when the
    // user opens rename and blurs without editing).
    if (next !== (entity.title ?? "")) onRenameBranch(entity.name, next);
  };
  const cancelRename = () => setRenaming(false);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!renaming}
      onClick={() => {
        if (!renaming) onOpenBranch(entity.name);
      }}
      onKeyDown={(e) => {
        if (renaming) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenBranch(entity.name);
        }
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onRowDragOver}
      onDrop={onRowDrop}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex w-full min-w-0 cursor-grab items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent active:cursor-grabbing",
        active && "bg-accent font-medium text-foreground ring-1 ring-inset ring-primary/40",
        dropBefore && "border-t-2 border-primary",
        dropAfter && "border-b-2 border-primary",
      )}
    >
      <BranchDot hasWorktree={entity.hasWorktree} status={entity.agentStatus} />
      {entity.serverRunning && (
        <span
          className="size-1.5 shrink-0 rounded-full bg-emerald-500"
          title="Dev server running"
          aria-label="Dev server running"
        />
      )}
      {renaming ? (
        <input
          autoFocus
          value={draft}
          aria-label={`Rename ${entity.name}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelRename();
            }
          }}
          placeholder={entity.name}
          className="min-w-0 flex-1 rounded border border-input bg-background px-1 py-0.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      ) : (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden" title={entity.name}>
          {(() => {
            // Only treat a title as "custom" (worth a second branch-name line) when it actually
            // differs from the git branch name — a title equal to the name would just render the
            // same string twice.
            const hasCustomTitle = !!entity.title && entity.title !== entity.name;
            return (
              <>
                <span
                  className={cn(
                    "truncate text-xs",
                    !hasCustomTitle && "font-mono",
                    entity.isCurrent && "font-semibold text-foreground",
                  )}
                >
                  {entity.displayName}
                </span>
                {hasCustomTitle && (
                  <span className="truncate font-mono text-[10px] leading-tight text-muted-foreground">
                    {entity.name}
                  </span>
                )}
              </>
            );
          })()}
        </div>
      )}
      {!renaming && time && <span className="shrink-0 text-xs text-muted-foreground">{time}</span>}
      {!renaming && (
        <FileMenu
          entity={entity}
          features={features}
          onFileBranch={onFileBranch}
          onUnfileBranch={onUnfileBranch}
          onRename={startRename}
        />
      )}
    </div>
  );
}

export interface SidebarRecentProps {
  featureGroups: FeatureGroup[];
  unfiled: BranchEntity[];
  onOpenBranch: (name: string) => void;
  onFileBranch: (featureId: string, branch: string) => void;
  onUnfileBranch: (featureId: string, branch: string) => void;
  /** Sets (or clears, with an empty string) a branch's friendly display title — does not rename
   * the git branch. */
  onRenameBranch: (branch: string, title: string) => void;
  /** Persists a drag-and-drop reorder of one feature's branches — `branches` is the feature's
   * full new order (a permutation of its current branches; see `reorderIds` in `dnd.ts`). */
  onReorderFeatureBranches: (featureId: string, branches: string[]) => void;
  /** Persists a drag-and-drop reorder of the Feature folders themselves — `order` is the
   * project's full new feature-id order. */
  onReorderFeatures: (order: string[]) => void;
  onNewFeature: () => void;
  /** The branch whose cockpit is currently open, if any — its row is highlighted as selected. */
  activeBranch?: string | null;
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
  onRenameBranch,
  onReorderFeatureBranches,
  onReorderFeatures,
  onNewFeature,
  activeBranch,
  onFetch,
  featuresLoading = false,
  branchesLoading = false,
}: SidebarRecentProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [fetching, setFetching] = useState(false);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // Floating drag-ghost: positioned via a ref + requestAnimationFrame (NOT React state) so
  // following the cursor never re-renders the sidebar. A document-level "dragover" listener
  // tracks the pointer everywhere (including gaps between rows); writes are coalesced to one per
  // animation frame and applied straight to the element's transform. (Updating state on every
  // dragover re-rendered every feature/branch row ~60×/s and made dragging stutter.)
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const ghostPos = useRef({ x: 0, y: 0 });
  const ghostRaf = useRef<number | null>(null);
  useEffect(() => {
    if (!dragging) return;
    const onDocDragOver = (e: DragEvent) => {
      // jsdom's fireEvent.dragOver falls back to a bare Event with no clientX/Y — ignore those.
      if (typeof e.clientX !== "number" || typeof e.clientY !== "number") return;
      ghostPos.current = { x: e.clientX, y: e.clientY };
      if (ghostRaf.current != null) return;
      ghostRaf.current = requestAnimationFrame(() => {
        ghostRaf.current = null;
        const el = ghostRef.current;
        if (el) el.style.transform = `translate3d(${ghostPos.current.x + 12}px, ${ghostPos.current.y + 8}px, 0)`;
      });
    };
    document.addEventListener("dragover", onDocDragOver);
    return () => {
      document.removeEventListener("dragover", onDocDragOver);
      if (ghostRaf.current != null) {
        cancelAnimationFrame(ghostRaf.current);
        ghostRaf.current = null;
      }
    };
  }, [dragging]);

  const features = featureGroups.map((g) => g.feature);
  // Reordering only ever targets the rendered (capped-at-MAX_ROWS) subset — a feature/branch
  // past the cap can't be dragged into view to begin with, matching the existing "first 10"
  // display cap elsewhere in this component.
  const visibleFeatureGroups = featureGroups.slice(0, MAX_ROWS);

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

  const clearDrag = () => {
    setDragging(null);
    setDropTarget(null);
  };

  // --- Branch rows (both a feature's member rows and the unfiled Branches rows share this) ---

  const handleBranchDragStart = (e: React.DragEvent<HTMLDivElement>, entity: BranchEntity) => {
    suppressDragImage(e);
    setBranchDragData(e.dataTransfer, { branch: entity.name, sourceFeatureId: entity.featureId });
    setDragging({ kind: "branch", branch: entity.name, sourceFeatureId: entity.featureId });
  };

  /** `listFeatureId` is the feature a row belongs to, or `undefined` for an unfiled (Branches
   * group) row — which has no manual order, so it only ever shows the "unfile" ring, never an
   * insertion line. */
  const handleBranchRowDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    listFeatureId: string | undefined,
    index: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragging || dragging.kind !== "branch") return;
    if (listFeatureId === undefined) {
      if (dragging.sourceFeatureId) setDropTarget({ kind: "unfile" });
      return;
    }
    if (dragging.sourceFeatureId === listFeatureId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const side = dropSide(rect, e.clientY);
      setDropTarget({ kind: "branch", featureId: listFeatureId, index: side === "before" ? index : index + 1 });
    } else {
      setDropTarget({ kind: "file", featureId: listFeatureId });
    }
  };

  const handleBranchRowDrop = (
    e: React.DragEvent<HTMLDivElement>,
    listFeatureId: string | undefined,
    index: number,
    group: FeatureGroup | undefined,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = getBranchDragData(e.dataTransfer);
    clearDrag();
    if (!payload) return;
    if (listFeatureId === undefined) {
      if (payload.sourceFeatureId) onUnfileBranch(payload.sourceFeatureId, payload.branch);
      return;
    }
    if (payload.sourceFeatureId === listFeatureId && group) {
      const ids = group.branches.map((b) => b.name);
      const rect = e.currentTarget.getBoundingClientRect();
      const side = dropSide(rect, e.clientY);
      const dropIndex = side === "before" ? index : index + 1;
      onReorderFeatureBranches(listFeatureId, reorderIds(ids, payload.branch, dropIndex));
    } else if (payload.sourceFeatureId !== listFeatureId) {
      onFileBranch(listFeatureId, payload.branch);
    }
  };

  // --- Feature folders: filing fallback (drop anywhere in the folder) + header-to-header reorder ---

  const handleFeatureContainerDragOver = (e: React.DragEvent<HTMLDivElement>, featureId: string) => {
    if (dragging?.kind === "branch" && dragging.sourceFeatureId !== featureId) {
      e.preventDefault();
      setDropTarget({ kind: "file", featureId });
    }
  };

  const handleFeatureContainerDrop = (e: React.DragEvent<HTMLDivElement>, featureId: string) => {
    const payload = getBranchDragData(e.dataTransfer);
    clearDrag();
    if (payload && payload.sourceFeatureId !== featureId) {
      e.preventDefault();
      onFileBranch(featureId, payload.branch);
    }
  };

  const handleFeatureHeaderDragStart = (e: React.DragEvent<HTMLElement>, featureId: string) => {
    suppressDragImage(e);
    setFeatureDragData(e.dataTransfer, featureId);
    setDragging({ kind: "feature", featureId });
  };

  const handleFeatureHeaderDragOver = (e: React.DragEvent<HTMLElement>, index: number) => {
    // Only intercepts a feature-folder drag — a branch dropped on a header falls through
    // (un-stopped) to the folder's own container fallback (file it into this feature).
    if (dragging?.kind !== "feature") return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const side = dropSide(rect, e.clientY);
    setDropTarget({ kind: "feature", index: side === "before" ? index : index + 1 });
  };

  const handleFeatureHeaderDrop = (e: React.DragEvent<HTMLElement>, index: number) => {
    const payload = getFeatureDragData(e.dataTransfer);
    if (!payload) return; // let a branch payload's drop bubble to the folder's own handler
    e.preventDefault();
    e.stopPropagation();
    const ids = visibleFeatureGroups.map((g) => g.feature.id);
    const rect = e.currentTarget.getBoundingClientRect();
    const side = dropSide(rect, e.clientY);
    const dropIndex = side === "before" ? index : index + 1;
    clearDrag();
    onReorderFeatures(reorderIds(ids, payload.featureId, dropIndex));
  };

  const handleFeatureSectionDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (dragging?.kind === "feature") {
      e.preventDefault();
      setDropTarget({ kind: "feature", index: visibleFeatureGroups.length });
    }
  };

  const handleFeatureSectionDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const payload = getFeatureDragData(e.dataTransfer);
    clearDrag();
    if (payload) {
      e.preventDefault();
      const ids = visibleFeatureGroups.map((g) => g.feature.id);
      onReorderFeatures(reorderIds(ids, payload.featureId, visibleFeatureGroups.length));
    }
  };

  // --- Branches group (unfiled): drop anywhere in it to unfile ---

  const handleUnfileSectionDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (dragging?.kind === "branch" && dragging.sourceFeatureId) {
      e.preventDefault();
      setDropTarget({ kind: "unfile" });
    }
  };

  const handleUnfileSectionDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const payload = getBranchDragData(e.dataTransfer);
    clearDrag();
    if (payload?.sourceFeatureId) {
      e.preventDefault();
      onUnfileBranch(payload.sourceFeatureId, payload.branch);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-2 pt-2">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scroll">
        <div onDragOver={handleFeatureSectionDragOver} onDrop={handleFeatureSectionDrop}>
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
            visibleFeatureGroups.map(({ feature, branches, hasActiveSession }, featureIdx) => {
              const isExpanded = expanded.has(feature.id);
              const isFileTarget = dropTarget?.kind === "file" && dropTarget.featureId === feature.id;
              const folderDropBefore = dropTarget?.kind === "feature" && dropTarget.index === featureIdx;
              const folderDropAfter =
                featureIdx === visibleFeatureGroups.length - 1 &&
                dropTarget?.kind === "feature" &&
                dropTarget.index === visibleFeatureGroups.length;
              return (
                <div
                  key={feature.id}
                  onDragOver={(e) => handleFeatureContainerDragOver(e, feature.id)}
                  onDrop={(e) => handleFeatureContainerDrop(e, feature.id)}
                  className={cn(
                    "rounded-md",
                    isFileTarget && "ring-2 ring-primary",
                    folderDropBefore && "border-t-2 border-primary",
                    folderDropAfter && "border-b-2 border-primary",
                  )}
                >
                  <div
                    draggable
                    onDragStart={(e) => handleFeatureHeaderDragStart(e, feature.id)}
                    onDragEnd={clearDrag}
                    onDragOver={(e) => handleFeatureHeaderDragOver(e, featureIdx)}
                    onDrop={(e) => handleFeatureHeaderDrop(e, featureIdx)}
                    className="flex w-full cursor-grab items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent active:cursor-grabbing"
                  >
                    <FeatureIconButton featureId={feature.id} />
                    <button
                      type="button"
                      onClick={() => toggleExpanded(feature.id)}
                      aria-label={isExpanded ? `Collapse ${feature.name}` : `Expand ${feature.name}`}
                      className="min-w-0 flex-1 truncate text-left"
                    >
                      {feature.name}
                    </button>
                    {hasActiveSession && (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                        title="Active session"
                        aria-label="Active session"
                      />
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {branches.length} branch{branches.length === 1 ? "" : "es"}
                    </span>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-hidden
                      onClick={() => toggleExpanded(feature.id)}
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="ml-4 flex flex-col border-l border-border pl-2">
                      {branches.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-muted-foreground">No branches yet.</p>
                      ) : (
                        branches.map((entity, idx) => {
                          const isLastRow = idx === branches.length - 1;
                          return (
                            <BranchRow
                              key={entity.name}
                              entity={entity}
                              features={features}
                              active={entity.name === activeBranch}
                              onOpenBranch={onOpenBranch}
                              onFileBranch={onFileBranch}
                              onUnfileBranch={onUnfileBranch}
                              onRenameBranch={onRenameBranch}
                              onDragStart={(e) => handleBranchDragStart(e, entity)}
                              onDragEnd={clearDrag}
                              onRowDragOver={(e) => handleBranchRowDragOver(e, feature.id, idx)}
                              onRowDrop={(e) => handleBranchRowDrop(e, feature.id, idx, { feature, branches })}
                              dropBefore={dropTarget?.kind === "branch" && dropTarget.featureId === feature.id && dropTarget.index === idx}
                              dropAfter={
                                isLastRow &&
                                dropTarget?.kind === "branch" &&
                                dropTarget.featureId === feature.id &&
                                dropTarget.index === branches.length
                              }
                            />
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div
          onDragOver={handleUnfileSectionDragOver}
          onDrop={handleUnfileSectionDrop}
          className={cn("rounded-md", dropTarget?.kind === "unfile" && "ring-2 ring-primary")}
        >
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
                  active={entity.name === activeBranch}
                  onOpenBranch={onOpenBranch}
                  onFileBranch={onFileBranch}
                  onUnfileBranch={onUnfileBranch}
                  onRenameBranch={onRenameBranch}
                  onDragStart={(e) => handleBranchDragStart(e, entity)}
                  onDragEnd={clearDrag}
                  onRowDragOver={(e) => handleBranchRowDragOver(e, undefined, 0)}
                  onRowDrop={(e) => handleBranchRowDrop(e, undefined, 0, undefined)}
                />
              ))
          )}
        </div>
      </div>
      {dragging && (
        <div
          ref={ghostRef}
          data-testid="drag-ghost"
          className="pointer-events-none fixed left-0 top-0 z-50 flex items-center gap-1.5 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
          style={{ transform: "translate3d(-9999px, -9999px, 0)" }}
        >
          {dragging.kind === "branch" ? (
            <>
              <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="font-mono">{dragging.branch}</span>
            </>
          ) : (
            <>
              <Folder className="size-3.5 shrink-0 text-muted-foreground" />
              <span>
                {featureGroups.find((g) => g.feature.id === dragging.featureId)?.feature.name ?? ""}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
