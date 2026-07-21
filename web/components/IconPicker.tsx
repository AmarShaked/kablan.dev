import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ICONS,
  ICON_NAMES,
  ProjectIcon,
  iconNameFor,
  setProjectIcon,
  useProjectIcons,
} from "@/lib/projectIcons.tsx";
import { cn } from "@/lib/utils";

/** Clickable project icon that opens a grid picker; persists to localStorage. */
export function IconPicker({ project }: { project: string }) {
  const icons = useProjectIcons();
  const current = iconNameFor(project, icons);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Change icon"
          className="flex size-8 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-accent"
        >
          <ProjectIcon name={current} className="size-[18px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="grid grid-cols-8 gap-1">
          {ICON_NAMES.map((name) => {
            const Icon = ICONS[name];
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setProjectIcon(project, name);
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
