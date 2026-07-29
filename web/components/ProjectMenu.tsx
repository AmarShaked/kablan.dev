import { ProjectSwitcher } from "./ProjectSwitcher.tsx";
import { SidebarRecent } from "./SidebarRecent.tsx";
import type { ProjectSummary, RunningServer } from "../api.ts";
import type { ProjectEntity } from "../lib/projectEntities.ts";

export interface ProjectMenuEntities {
  features: ProjectEntity[];
  taskForces: ProjectEntity[];
  branches: ProjectEntity[];
  worktrees: ProjectEntity[];
}

export interface ProjectMenuProps {
  projects: ProjectSummary[];
  selected: string | null;
  onSelectProject: (name: string) => void;
  servers: Record<string, RunningServer>;
  onRescan: () => void;
  entities: ProjectMenuEntities;
  unreadFor: (featureId: string) => number;
  onOpenFeature: (featureId: string) => void;
  onOpenTaskForce: (featureId: string, taskForceId: string) => void;
  onOpenBranch: (name: string) => void;
  onOpenWorktree: (e: ProjectEntity) => void;
  onViewAll: (kind: "features" | "branches" | "worktrees") => void;
  /** Fetches all remotes for the selected project (`git fetch --all --prune`) and invalidates
   * the branches/worktrees queries — the same action `OverviewTab`'s "Fetch" button used to
   * trigger, now surfaced here (in the Worktrees group header) since the Branches tab is gone. */
  onFetch: () => Promise<void> | void;
}

/**
 * The project column: `ProjectSwitcher` at top, then `SidebarRecent`'s Features/Worktrees/
 * Branches lists + filter box ("Find a feature, worktree, branch…"). Scrolls internally
 * (`SidebarRecent` owns its own scroll region) so only the switcher header stays fixed.
 */
export function ProjectMenu({
  projects,
  selected,
  onSelectProject,
  servers,
  onRescan,
  entities,
  unreadFor,
  onOpenFeature,
  onOpenTaskForce,
  onOpenBranch,
  onOpenWorktree,
  onViewAll,
  onFetch,
}: ProjectMenuProps) {
  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
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
          features={entities.features}
          taskForces={entities.taskForces}
          worktrees={entities.worktrees}
          branches={entities.branches}
          unreadFor={unreadFor}
          onOpenFeature={onOpenFeature}
          onOpenTaskForce={onOpenTaskForce}
          onOpenBranch={onOpenBranch}
          onOpenWorktree={onOpenWorktree}
          onViewAll={onViewAll}
          onFetch={onFetch}
        />
      </div>
    </div>
  );
}
