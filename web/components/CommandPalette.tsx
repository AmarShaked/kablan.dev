import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AgentDot } from "./AgentDot.tsx";
import { filterEntities, type EntityKind, type ProjectEntity } from "../lib/projectEntities.ts";

const GROUP_ORDER: EntityKind[] = ["feature", "taskForce", "branch", "worktree"];
const GROUP_LABELS: Record<EntityKind, string> = {
  feature: "Features",
  taskForce: "Task Forces",
  branch: "Branches",
  worktree: "Worktrees",
};

const PALETTE_INPUT_ID = "command-palette-search";

export interface CommandPaletteEntities {
  features: ProjectEntity[];
  taskForces: ProjectEntity[];
  branches: ProjectEntity[];
  worktrees: ProjectEntity[];
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entities: CommandPaletteEntities;
  onSelect: (e: ProjectEntity) => void;
}

/** Global, project-scoped ⌘K search over every feature/task force/branch/worktree — the
 * command-palette counterpart to the sidebar's SidebarRecent filter box, but unbounded (no
 * top-10 cap) and searching all four kinds at once. Built from Dialog + Input since the repo
 * has no shadcn command.tsx. */
export function CommandPalette({ open, onOpenChange, entities, onSelect }: CommandPaletteProps) {
  const [q, setQ] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  // Reset search + highlight each time the palette opens, so a stale query from the last
  // session doesn't linger.
  useEffect(() => {
    if (!open) return;
    setQ("");
    setHighlighted(0);
    const el = document.getElementById(PALETTE_INPUT_ID) as HTMLInputElement | null;
    el?.focus();
  }, [open]);

  const groups = useMemo(() => {
    const byKind: Record<EntityKind, ProjectEntity[]> = {
      feature: filterEntities(entities.features, q),
      taskForce: filterEntities(entities.taskForces, q),
      branch: filterEntities(entities.branches, q),
      worktree: filterEntities(entities.worktrees, q),
    };
    return GROUP_ORDER.map((kind) => ({ kind, items: byKind[kind] })).filter((g) => g.items.length > 0);
  }, [entities, q]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Query changes shrink/grow the visible set — keep the highlight in range rather than
  // pointing at a row that no longer exists.
  useEffect(() => {
    setHighlighted((i) => Math.min(i, Math.max(flat.length - 1, 0)));
  }, [flat.length]);

  const selectHighlighted = () => {
    const entity = flat[highlighted];
    if (entity) onSelect(entity);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectHighlighted();
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
        onKeyDown={handleKeyDown}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="border-b border-border p-2">
          <Input
            id={PALETTE_INPUT_ID}
            type="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search features, task forces, branches, worktrees…"
            aria-label="Command palette search"
            className="border-none shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-96 overflow-y-auto p-2 custom-scroll">
          {flat.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">No results.</p>
          ) : (
            groups.map((group) => (
              <div key={group.kind} className="mb-2 last:mb-0">
                <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {GROUP_LABELS[group.kind]}
                </div>
                {group.items.map((entity) => {
                  const index = flat.indexOf(entity);
                  return (
                    <button
                      key={entity.id}
                      type="button"
                      onMouseEnter={() => setHighlighted(index)}
                      onClick={() => onSelect(entity)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        index === highlighted ? "bg-accent" : "hover:bg-accent/50",
                      )}
                    >
                      {(entity.kind === "feature" || entity.kind === "taskForce") && (
                        <AgentDot status={entity.status} />
                      )}
                      <span className="min-w-0 flex-1 truncate">{entity.label}</span>
                      {entity.kind !== "branch" && entity.branch && (
                        <span className="shrink-0 truncate font-mono text-xs text-muted-foreground">
                          {entity.branch}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
