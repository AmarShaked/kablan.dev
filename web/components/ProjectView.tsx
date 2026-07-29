import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useFactory } from "../queries.ts";
import { useAgentStream } from "../hooks/useAgentStream.tsx";
import { AgentDot, UnreadPill } from "./AgentDot.tsx";
import { CreateFeatureDialog } from "./CreateFeatureDialog.tsx";
import { CreateTaskForceDialog } from "./CreateTaskForceDialog.tsx";
import { IconPicker } from "./IconPicker.tsx";
import { Button } from "@/components/ui/button";
import type { ProjectSummary } from "../api.ts";

/** Features/task-forces browser for the project's main-area home — absorbs the old
 * FactorySidebar's Features section (expand/collapse, unread pills, New feature/task force)
 * and FeaturePage's roll-up, now rendered as the Features tab instead of a nested sidebar. */
function FeaturesBrowser({
  project,
  onOpenTaskForce,
  expandFeatureId,
  expandNonce,
}: {
  project: string;
  onOpenTaskForce: (featureId: string, taskForceId: string) => void;
  /** When set (e.g. from the sidebar's SidebarRecent/CommandPalette routing into a feature),
   * that feature's row is force-expanded — including on first mount, not just on change. */
  expandFeatureId?: string | null;
  /** Bumped by the caller on every "open feature" request, even re-selecting the same
   * `expandFeatureId` (e.g. the sidebar/palette after the user manually collapsed it). Without
   * this the effect below only depended on `expandFeatureId`, so re-picking the same id was a
   * no-op (React bails out on an unchanged primitive) and the feature stayed collapsed. */
  expandNonce?: number;
}) {
  const { data } = useFactory(project);
  const features = data?.features ?? [];
  const { agentFor, unread } = useAgentStream();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [newFeatureOpen, setNewFeatureOpen] = useState(false);
  const [newTaskForceFeatureId, setNewTaskForceFeatureId] = useState<string | null>(null);

  useEffect(() => {
    if (!expandFeatureId) return;
    setOpen((prev) => new Set(prev).add(expandFeatureId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandFeatureId, expandNonce]);

  const toggleExpanded = (featureId: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(featureId)) next.delete(featureId);
      else next.add(featureId);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Features</h2>
        <Button size="sm" onClick={() => setNewFeatureOpen(true)}>
          <Plus className="size-3.5" />
          New feature
        </Button>
      </div>

      {features.length === 0 ? (
        <p className="text-sm text-muted-foreground">No features yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {features.map((feature) => {
            const expanded = open.has(feature.id);
            const featureUnread = feature.taskForces.reduce(
              (sum, tf) => sum + unread(`${project}::${tf.id}`),
              0,
            );
            return (
              <div key={feature.id} className="rounded-lg border border-border">
                <div className="flex items-center gap-1 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(feature.id)}
                    aria-label={expanded ? `Collapse ${feature.name}` : `Expand ${feature.name}`}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-accent"
                  >
                    {expanded ? (
                      <ChevronDown className="size-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(feature.id)}
                    className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{feature.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {feature.taskForces.length} task force{feature.taskForces.length === 1 ? "" : "s"}
                    </span>
                    <UnreadPill count={featureUnread} testId={`unread-pill-feature-${feature.id}`} />
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`New task force in ${feature.name}`}
                    onClick={() => setNewTaskForceFeatureId(feature.id)}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                {expanded && (
                  <div className="flex flex-col divide-y divide-border border-t border-border">
                    {feature.taskForces.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No task forces yet.</div>
                    )}
                    {feature.taskForces.map((tf) => (
                      <button
                        key={tf.id}
                        type="button"
                        onClick={() => onOpenTaskForce(feature.id, tf.id)}
                        className="flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                      >
                        <AgentDot status={agentFor(`${project}::${tf.id}`).status} />
                        <span className="min-w-0 flex-1 truncate">{tf.name}</span>
                        <span className="truncate font-mono text-xs text-muted-foreground">{tf.branch}</span>
                        <UnreadPill count={unread(`${project}::${tf.id}`)} testId={`unread-pill-${tf.id}`} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CreateFeatureDialog
        project={project}
        open={newFeatureOpen}
        onOpenChange={setNewFeatureOpen}
        onCreated={(feature) => setOpen((prev) => new Set(prev).add(feature.id))}
      />
      {newTaskForceFeatureId && (
        <CreateTaskForceDialog
          project={project}
          featureId={newTaskForceFeatureId}
          open
          onOpenChange={(next) => {
            if (!next) setNewTaskForceFeatureId(null);
          }}
          onCreated={(taskForce) => onOpenTaskForce(newTaskForceFeatureId, taskForce.id)}
        />
      )}
    </div>
  );
}

/** A project's home in the main area: a breadcrumb, then the Features (task-force) browser —
 * the "Branches & worktrees" tab moved to the `ProjectMenu` rail (`SidebarRecent`'s Worktrees/
 * Branches groups) now that the sidebar is two-level (global rail + project menu) instead of a
 * per-project tab. */
export function ProjectView({
  project,
  onOpenTaskForce,
  expandFeatureId = null,
  expandNonce,
}: {
  project: ProjectSummary;
  onOpenTaskForce: (featureId: string, taskForceId: string) => void;
  /** Feature id to force-expand in the Features browser (sidebar/palette "open feature"). */
  expandFeatureId?: string | null;
  /** See `FeaturesBrowser`'s doc comment — bump on every "open feature" request so re-selecting
   * the same feature re-expands it even after a manual collapse. */
  expandNonce?: number;
}) {
  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <IconPicker project={project.name} />
        <nav aria-label="Breadcrumb" className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{project.name}</h1>
          <div className="truncate font-mono text-xs text-muted-foreground">{project.path}</div>
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto custom-scroll">
        <FeaturesBrowser
          project={project.name}
          onOpenTaskForce={onOpenTaskForce}
          expandFeatureId={expandFeatureId}
          expandNonce={expandNonce}
        />
      </div>
    </>
  );
}
