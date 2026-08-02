import { useState } from "react";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../api.ts";
import { ProjectSwitcher } from "./ProjectSwitcher.tsx";
import { SidebarRecent } from "./SidebarRecent.tsx";
import { CreateFeatureDialog } from "./CreateFeatureDialog.tsx";
import type { ProjectSummary, RunningServer } from "../api.ts";
import type { BranchEntity, FeatureGroup } from "../lib/projectEntities.ts";

export interface ProjectMenuProps {
  projects: ProjectSummary[];
  selected: string | null;
  onSelectProject: (name: string) => void;
  servers: Record<string, RunningServer>;
  onRescan: () => void;
  featureGroups: FeatureGroup[];
  unfiled: BranchEntity[];
  onOpenBranch: (name: string) => void;
  /** The branch whose cockpit is currently open — highlighted as selected in the branch lists. */
  activeBranch?: string | null;
  /** Fetches all remotes for the selected project (`git fetch --all --prune`) and invalidates
   * the branches/worktrees queries — surfaced in the Branches group header. */
  onFetch: () => Promise<void> | void;
  /** Pending state of the underlying factory/branches queries — threaded down to
   * `SidebarRecent` so it can show skeleton rows instead of a premature "No …" empty state. */
  featuresLoading?: boolean;
  branchesLoading?: boolean;
  /** Opens the "New session" dialog for the selected project — surfaced as a "+" beside the
   * project switcher. Omitted (button hidden) when no project is selected. */
  onNewSession?: () => void;
}

/**
 * The project column: `ProjectSwitcher` at top, then `SidebarRecent`'s Feature folders +
 * Branches list. Also owns filing/unfiling a branch into a feature and the "New feature" dialog
 * — both are project-scoped factory mutations that only this column's `SidebarRecent` triggers,
 * so they're kept local here rather than threaded all the way up through `App`.
 */
export function ProjectMenu({
  projects,
  selected,
  onSelectProject,
  servers,
  onRescan,
  featureGroups,
  unfiled,
  onOpenBranch,
  activeBranch,
  onFetch,
  featuresLoading,
  branchesLoading,
  onNewSession,
}: ProjectMenuProps) {
  const queryClient = useQueryClient();
  const [newFeatureOpen, setNewFeatureOpen] = useState(false);

  const invalidateFactory = () => queryClient.invalidateQueries({ queryKey: ["factory", selected] });

  const fileBranch = async (featureId: string, branch: string) => {
    if (!selected) return;
    try {
      await api.factory.fileBranch(selected, featureId, branch);
      await invalidateFactory();
    } catch (err) {
      toast.error(String(err));
    }
  };

  const unfileBranch = async (featureId: string, branch: string) => {
    if (!selected) return;
    try {
      await api.factory.unfileBranch(selected, featureId, branch);
      await invalidateFactory();
    } catch (err) {
      toast.error(String(err));
    }
  };

  const reorderFeatureBranches = async (featureId: string, branches: string[]) => {
    if (!selected) return;
    try {
      await api.factory.reorderFeatureBranches(selected, featureId, branches);
      await invalidateFactory();
    } catch (err) {
      toast.error(String(err));
    }
  };

  const reorderFeatures = async (order: string[]) => {
    if (!selected) return;
    try {
      await api.factory.reorderFeatures(selected, order);
      await invalidateFactory();
    } catch (err) {
      toast.error(String(err));
    }
  };

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-border text-foreground">
      <div className="border-b border-border p-2">
        <ProjectSwitcher
          projects={projects}
          selected={selected}
          onSelect={onSelectProject}
          servers={servers}
          onRescan={onRescan}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <SidebarRecent
          featureGroups={featureGroups}
          unfiled={unfiled}
          activeBranch={activeBranch}
          onOpenBranch={onOpenBranch}
          onFileBranch={fileBranch}
          onUnfileBranch={unfileBranch}
          onReorderFeatureBranches={reorderFeatureBranches}
          onReorderFeatures={reorderFeatures}
          onNewFeature={() => setNewFeatureOpen(true)}
          onFetch={onFetch}
          featuresLoading={featuresLoading}
          branchesLoading={branchesLoading}
        />
      </div>

      {onNewSession && (
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={onNewSession}
            aria-label="New session"
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Plus className="size-4" /> New session
          </button>
        </div>
      )}

      {selected && (
        <CreateFeatureDialog
          project={selected}
          open={newFeatureOpen}
          onOpenChange={setNewFeatureOpen}
          onCreated={() => {}}
        />
      )}
    </div>
  );
}
