import { useState } from "react";
import { ChevronsUpDown, RefreshCw, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ProjectIcon, iconNameFor, useProjectIcons } from "@/lib/projectIcons.tsx";
import { cn } from "@/lib/utils";
import { useAgentStream } from "../hooks/useAgentStream.tsx";
import { StatusDot } from "./StatusDot.tsx";
import { UnreadPill } from "./AgentDot.tsx";
import type { ProjectSummary, RunningServer } from "../api.ts";

/** Sidebar header control (shadcn "TeamSwitcher" pattern): shows the selected project and
 * opens a popover to filter/pick another one or trigger a rescan. Replaces the old sidebar
 * header's inline project filter + running-only toggle now that project browsing moved into
 * the main area (ProjectView). */
export function ProjectSwitcher({
  projects,
  selected,
  onSelect,
  servers = {},
  onRescan,
}: {
  projects: ProjectSummary[];
  selected: string | null;
  onSelect: (name: string) => void;
  servers?: Record<string, RunningServer>;
  onRescan?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const projectIcons = useProjectIcons();
  const { unreadForProject } = useAgentStream();

  const selectedProject = projects.find((p) => p.name === selected) ?? null;
  const selectedUnread = selected ? unreadForProject(selected) : 0;

  const query = filter.trim().toLowerCase();
  const visible = query ? projects.filter((p) => p.name.toLowerCase().includes(query)) : projects;

  const isRunning = (name: string) => {
    const s = servers[name];
    return s?.status === "running" || s?.status === "starting";
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFilter("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Switch project"
          className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
        >
          <ProjectIcon name={iconNameFor(selected ?? "", projectIcons)} className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{selectedProject?.name ?? "Select a project"}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {selectedProject && selectedUnread > 0
                ? `${selectedUnread} need${selectedUnread === 1 ? "s" : ""} you`
                : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setFilter("")}
            placeholder="Filter projects…"
            spellCheck={false}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div data-testid="project-switcher-list" className="flex max-h-72 flex-col gap-0.5 overflow-y-auto custom-scroll">
          {visible.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No projects match “{filter.trim()}”.
            </div>
          )}
          {visible.map((p) => {
            const running = isRunning(p.name);
            const unread = unreadForProject(p.name);
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  onSelect(p.name);
                  setOpen(false);
                  setFilter("");
                }}
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent",
                  p.name === selected && "bg-accent",
                )}
              >
                <ProjectIcon name={iconNameFor(p.name, projectIcons)} className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {running && <StatusDot status={servers[p.name]!.status} />}
                <UnreadPill count={unread} testId={`unread-pill-switcher-${p.name}`} />
              </button>
            );
          })}
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => onRescan?.()}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className="size-3.5 shrink-0" />
            Rescan
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
