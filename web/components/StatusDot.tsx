import { cn } from "@/lib/utils";
import type { ServerStatus } from "../api.ts";

const COLORS: Record<string, string> = {
  running: "bg-[var(--success)] shadow-[0_0_8px_var(--success)]",
  starting: "bg-[var(--warning)]",
  exited: "bg-destructive",
  error: "bg-destructive",
  stopped: "bg-muted-foreground",
};

export function StatusDot({ status }: { status?: ServerStatus }) {
  return (
    <span
      className={cn("inline-block size-2 rounded-full shrink-0", COLORS[status ?? ""] ?? "bg-muted-foreground/50")}
      title={status ?? "stopped"}
    />
  );
}
