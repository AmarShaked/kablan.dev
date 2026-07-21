import { cn } from "@/lib/utils";
import type { ServerStatus } from "../api.ts";

const COLORS: Record<string, string> = {
  running: "bg-[var(--success)] shadow-[0_0_5px_-1px_var(--success)]",
  starting: "bg-[var(--warning)]",
  exited: "bg-destructive/80",
  error: "bg-destructive/80",
  stopped: "bg-muted-foreground/60",
};

export function StatusDot({ status }: { status?: ServerStatus }) {
  return (
    <span
      className={cn("inline-block size-2 rounded-full shrink-0", COLORS[status ?? ""] ?? "bg-muted-foreground/50")}
      title={status ?? "stopped"}
    />
  );
}
