import { useState } from "react";
import { ChevronDown, ChevronRight, FolderTree, GitBranch, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFactory } from "../queries.ts";
import { useAgentStream } from "../hooks/useAgentStream.tsx";
import { CreateFeatureDialog } from "./CreateFeatureDialog.tsx";
import { CreateTaskForceDialog } from "./CreateTaskForceDialog.tsx";
import type { AgentStatus } from "../api.ts";

/** Status → dot color, matching the mockups (sky/amber/emerald/rose/muted). */
const AGENT_DOT_COLORS: Record<string, string> = {
  working: "bg-sky-500 shadow-[0_0_5px_-1px_theme(colors.sky.500)]",
  awaitingInput: "bg-amber-500",
  done: "bg-emerald-500",
  failed: "bg-rose-500",
};

export function AgentDot({ status }: { status?: AgentStatus }) {
  return (
    <span
      className={cn(
        "inline-block size-2 rounded-full shrink-0",
        AGENT_DOT_COLORS[status ?? ""] ?? "bg-muted-foreground/50",
      )}
      title={status ?? "idle"}
    />
  );
}

export interface BranchEntry {
  id: string;
  name: string;
  kind: "worktree" | "branch" | string;
}

/** Row styling shared by feature/task-force/branch rows — mirrors SidebarMenuButton's look
 * without depending on the real Sidebar context (this component is also used standalone). */
const rowClass =
  "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-foreground transition-colors hover:bg-accent";

export function FactorySidebar({
  project,
  branchEntries,
  onBack,
  onOpenFeature,
  onOpenTaskForce,
  onOpenBranch,
}: {
  project: string;
  branchEntries: BranchEntry[];
  onBack: () => void;
  onOpenFeature: (featureId: string) => void;
  onOpenTaskForce: (featureId: string, taskForceId: string) => void;
  onOpenBranch?: (entry: BranchEntry) => void;
}) {
  const { data } = useFactory(project);
  const features = data?.features ?? [];
  const { agentFor } = useAgentStream();
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
    <div className="flex flex-col">
      <button
        onClick={onBack}
        className="flex h-8 items-center gap-1.5 px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className="size-3.5 rotate-180" />
        Projects
      </button>

      <div className="flex flex-col p-2">
        <div className="flex h-8 shrink-0 items-center px-2 text-xs font-medium text-muted-foreground">
          Features
        </div>
        {features.length === 0 && (
          <div className="px-2 py-1 text-xs text-muted-foreground">No features yet.</div>
        )}
        <div className="flex flex-col gap-0.5">
          {features.map((feature) => {
            const expanded = open.has(feature.id);
            return (
              <div key={feature.id}>
                <div className={cn(rowClass, "gap-0 pr-0")}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(feature.id);
                    }}
                    aria-label={expanded ? `Collapse ${feature.name}` : `Expand ${feature.name}`}
                    className="flex h-7 w-6 shrink-0 items-center justify-center"
                  >
                    {expanded ? (
                      <ChevronDown className="size-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenFeature(feature.id)}
                    className="flex h-7 min-w-0 flex-1 items-center truncate pr-2 text-left"
                  >
                    <span className="truncate">{feature.name}</span>
                  </button>
                </div>
                {expanded && (
                  <div className="flex flex-col gap-0.5 pl-5">
                    {feature.taskForces.length === 0 && (
                      <div className="px-2 py-1 text-xs text-muted-foreground">No task forces yet.</div>
                    )}
                    {feature.taskForces.map((tf) => (
                      <button
                        key={tf.id}
                        className={rowClass}
                        onClick={() => onOpenTaskForce(feature.id, tf.id)}
                      >
                        <AgentDot status={agentFor(`${project}::${tf.id}`).status} />
                        <span className="truncate">{tf.name}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => setNewTaskForceFeatureId(feature.id)}
                      className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Plus className="size-3.5 shrink-0" />
                      New task force
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button
          onClick={() => setNewFeatureOpen(true)}
          className="mt-1 flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5 shrink-0" />
          New feature
        </button>
      </div>

      <CreateFeatureDialog
        project={project}
        open={newFeatureOpen}
        onOpenChange={setNewFeatureOpen}
        onCreated={(feature) => onOpenFeature(feature.id)}
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

      <div className="flex flex-col p-2">
        <div className="flex h-8 shrink-0 items-center px-2 text-xs font-medium text-muted-foreground">
          Branches &amp; worktrees
        </div>
        {branchEntries.length === 0 && (
          <div className="px-2 py-1 text-xs text-muted-foreground">No branches or worktrees.</div>
        )}
        <div className="flex flex-col gap-0.5">
          {branchEntries.map((entry) => {
            const Icon = entry.kind === "worktree" ? FolderTree : GitBranch;
            return (
              <button key={entry.id} className={rowClass} onClick={() => onOpenBranch?.(entry)}>
                <Icon
                  className={cn(
                    "size-3.5 shrink-0",
                    entry.kind === "worktree"
                      ? "text-violet-500 dark:text-violet-400"
                      : "text-sky-500 dark:text-sky-400",
                  )}
                />
                <span className="truncate">{entry.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
