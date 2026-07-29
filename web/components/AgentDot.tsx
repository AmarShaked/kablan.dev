import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { AgentStatus } from "../api.ts";

/** Status → dot color, matching the mockups (sky/amber/emerald/rose/muted). Shared across the
 * Features browser, the cockpit header, and the Inbox — moved out of FactorySidebar (retired). */
export const AGENT_DOT_COLORS: Record<string, string> = {
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

/** Compact unread-count pill, reused for task-force rows, feature rows (summed), the
 * Projects list, and the ProjectSwitcher popover. Renders nothing when count is zero. */
export function UnreadPill({ count, testId }: { count: number; testId?: string }) {
  if (count <= 0) return null;
  return (
    <Badge
      data-testid={testId}
      className="h-4 min-w-4 shrink-0 justify-center rounded-full px-1 text-[10px] leading-none tabular-nums"
    >
      {count}
    </Badge>
  );
}
