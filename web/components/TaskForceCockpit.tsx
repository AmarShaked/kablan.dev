import { SidebarTrigger } from "@/components/ui/sidebar";
import type { TaskForce } from "../api.ts";
import { Cockpit } from "./Cockpit.tsx";

/**
 * Thin wrapper around the unified `Cockpit` for a task force target — kept as its own component
 * (rather than inlined at every call site) so `App.tsx`'s `TaskForceCockpit key={...} project={...}
 * taskForce={...}` call site (and its remount-per-task-force `key` behavior) doesn't need to
 * change. All the actual chat/details logic now lives in `Cockpit`/`AgentChat`/`WorktreeDetails`.
 *
 * The header keeps its own `SidebarTrigger` + title (as it did before the extraction) — `Cockpit`
 * renders its own breadcrumb below this, same as it will for worktree/branch targets.
 */
export function TaskForceCockpit({ project, taskForce }: { project: string; taskForce: TaskForce }) {
  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <SidebarTrigger className="shrink-0" />
        <h1 className="truncate text-lg font-semibold">{taskForce.name}</h1>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <Cockpit project={project} target={{ kind: "taskForce", taskForce }} />
      </div>
    </>
  );
}
