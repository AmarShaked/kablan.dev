import { useState } from "react";
import { Plus } from "lucide-react";
import { useFactory } from "../queries.ts";
import { CreateFeatureDialog } from "./CreateFeatureDialog.tsx";
import { IconPicker } from "./IconPicker.tsx";
import { Button } from "@/components/ui/button";
import type { ProjectSummary } from "../api.ts";

/**
 * A project's home in the main area, shown while no branch cockpit is open: a breadcrumb, then
 * a simple roster of the project's features (folders of branches) with a "New feature" action.
 * Branch browsing itself lives in the sidebar (`SidebarRecent`'s Feature folders + Branches
 * list) — this is just the project-level landing page, not a browser for task forces (retired
 * along with the task-force model).
 */
export function ProjectView({ project }: { project: ProjectSummary }) {
  const { data } = useFactory(project.name);
  const features = data?.features ?? [];
  const [newFeatureOpen, setNewFeatureOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <IconPicker project={project.name} />
        <nav aria-label="Breadcrumb" className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{project.name}</h1>
          <div className="truncate font-mono text-xs text-muted-foreground">{project.path}</div>
        </nav>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto custom-scroll p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Features</h2>
          <Button size="sm" onClick={() => setNewFeatureOpen(true)}>
            <Plus className="size-3.5" />
            New feature
          </Button>
        </div>

        {features.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No features yet. Group related branches into a feature, or open a branch from the sidebar to get
            started.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {features.map((feature) => (
              <div
                key={feature.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{feature.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {feature.branches.length} branch{feature.branches.length === 1 ? "" : "es"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateFeatureDialog
        project={project.name}
        open={newFeatureOpen}
        onOpenChange={setNewFeatureOpen}
        onCreated={() => {}}
      />
    </>
  );
}
