import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AgentDot } from "./AgentDot.tsx";
import { filterBranchEntities, type BranchEntity } from "../lib/projectEntities.ts";

const PALETTE_INPUT_ID = "command-palette-search";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: BranchEntity[];
  onSelect: (branch: string) => void;
}

/** Global, project-scoped ⌘K search over every branch — the command-palette counterpart to
 * the sidebar's SidebarRecent, but unbounded (no top-10 cap). Built from Dialog + Input since
 * the repo has no shadcn command.tsx. */
export function CommandPalette({ open, onOpenChange, branches, onSelect }: CommandPaletteProps) {
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

  const filtered = useMemo(() => filterBranchEntities(branches, q), [branches, q]);

  // Query changes shrink/grow the visible set — keep the highlight in range rather than
  // pointing at a row that no longer exists.
  useEffect(() => {
    setHighlighted((i) => Math.min(i, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  const selectHighlighted = () => {
    const entity = filtered[highlighted];
    if (entity) onSelect(entity.name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
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
            placeholder="Search branches…"
            aria-label="Command palette search"
            className="border-none shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-96 overflow-y-auto p-2 custom-scroll">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">No results.</p>
          ) : (
            <div>
              <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Branches
              </div>
              {filtered.map((entity, index) => (
                <button
                  key={entity.name}
                  type="button"
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => onSelect(entity.name)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    index === highlighted ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <AgentDot status={entity.agentStatus} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{entity.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
