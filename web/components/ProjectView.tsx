import { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useFactory } from "../queries.ts";
import { useAgentStream } from "../hooks/useAgentStream.tsx";
import { AgentDot, UnreadPill } from "./AgentDot.tsx";
import { CreateFeatureDialog } from "./CreateFeatureDialog.tsx";
import { CreateTaskForceDialog } from "./CreateTaskForceDialog.tsx";
import { OverviewTab } from "./OverviewTab.tsx";
import { IconPicker } from "./IconPicker.tsx";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { isTauri } from "../lib/version.ts";
import type { LogLine, ProjectSummary, RunningServer } from "../api.ts";

/** Features/task-forces browser for the project's main-area home — absorbs the old
 * FactorySidebar's Features section (expand/collapse, unread pills, New feature/task force)
 * and FeaturePage's roll-up, now rendered as the Features tab instead of a nested sidebar. */
function FeaturesBrowser({
  project,
  onOpenTaskForce,
}: {
  project: string;
  onOpenTaskForce: (featureId: string, taskForceId: string) => void;
}) {
  const { data } = useFactory(project);
  const features = data?.features ?? [];
  const { agentFor, unread } = useAgentStream();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [newFeatureOpen, setNewFeatureOpen] = useState(false);
  const [newTaskForceFeatureId, setNewTaskForceFeatureId] = useState<string | null>(null);

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

/** A project's home in the main area: a breadcrumb, then Features (task-force browser) and
 * Branches & worktrees (today's OverviewTab, unchanged) as flat tabs — replaces the old
 * sidebar's project → factory drill-down now that the sidebar is single-level. */
export function ProjectView({
  project,
  server,
  logs,
  onCommandChange,
  linearWorkspace,
  onOpenTaskForce,
}: {
  project: ProjectSummary;
  server: RunningServer | null;
  logs: LogLine[];
  onCommandChange: () => void;
  linearWorkspace: string;
  onOpenTaskForce: (featureId: string, taskForceId: string) => void;
}) {
  // The Features browser needs the desktop app's factory backend (useFactory is isTauri-gated);
  // in the browser-only reference server there's nothing to show there, so land on Branches &
  // worktrees instead — matching the pre-redesign default for that mode.
  const [tab, setTab] = useState<"features" | "branches">(isTauri ? "features" : "branches");

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <SidebarTrigger className="shrink-0" />
        <IconPicker project={project.name} />
        <nav aria-label="Breadcrumb" className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{project.name}</h1>
          <div className="truncate font-mono text-xs text-muted-foreground">{project.path}</div>
        </nav>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "features" | "branches")}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b border-border px-6">
          <TabsList variant="line" className="h-10">
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="branches">Branches &amp; worktrees</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="features" className="mt-0 min-h-0 flex-1 overflow-y-auto custom-scroll">
          <FeaturesBrowser project={project.name} onOpenTaskForce={onOpenTaskForce} />
        </TabsContent>
        <TabsContent value="branches" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <OverviewTab
            key={project.name}
            project={project}
            server={server}
            logs={logs}
            onCommandChange={onCommandChange}
            linearWorkspace={linearWorkspace}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
