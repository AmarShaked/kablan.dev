import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ICONS, ICON_NAMES, ProjectIcon, setProjectIcon, useProjectIcons } from "@/lib/projectIcons.tsx";
import { cn } from "@/lib/utils";

/** Namespaces a feature's entry in the (flat, shared) project-icon store, so feature icons never
 * collide with a project's own icon key. */
export function featureIconKey(featureId: string): string {
  return `feature:${featureId}`;
}

/**
 * Small per-feature-folder icon button that opens the same grid picker as `IconPicker`, keyed
 * into the shared icon store under `feature:${featureId}` (default `"folder"` when unset).
 * Lives inside the feature header row, so both the trigger and the popover's own clicks must
 * stop propagation — otherwise picking an icon (or even opening the popover) would also toggle
 * the folder's expand/collapse.
 */
export function FeatureIconButton({ featureId }: { featureId: string }) {
  const icons = useProjectIcons();
  const key = featureIconKey(featureId);
  const current = icons[key] ?? "folder";
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Change icon"
          onClick={(e) => e.stopPropagation()}
          className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ProjectIcon name={current} className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-8 gap-1">
          {ICON_NAMES.map((name) => {
            const Icon = ICONS[name];
            return (
              <button
                key={name}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setProjectIcon(key, name);
                  setOpen(false);
                }}
                title={name}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors hover:bg-accent",
                  name === current && "bg-accent text-primary ring-1 ring-primary/40",
                )}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
