import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OPEN_TARGETS } from "../lib/openTargets.tsx";
import type { OpenTarget } from "../api.ts";

/**
 * "Open in…" dropdown (VS Code / Cursor / Terminal / iTerm / Finder).
 * `trigger` must be a native element (the shadcn Button isn't forwardRef, so it
 * can't be a Radix asChild trigger).
 */
export function OpenMenu({
  onPick,
  trigger,
  align = "end",
}: {
  onPick: (target: OpenTarget) => void;
  trigger: React.ReactNode;
  align?: "start" | "end";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-44 p-1" onClick={(e) => e.stopPropagation()}>
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Open in
        </div>
        {OPEN_TARGETS.map((t) => (
          <button
            key={t.id}
            onClick={(e) => {
              e.stopPropagation();
              onPick(t.id);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
