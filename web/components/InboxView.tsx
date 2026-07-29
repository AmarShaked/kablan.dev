import { useInbox } from "../queries.ts";
import { AgentDot } from "./AgentDot.tsx";
import { Button } from "@/components/ui/button";
import type { AgentStatus, InboxEntry } from "../api.ts";

/** Global attention inbox — every task force across every project that's awaiting input or
 * has failed, so the user has one place to see what needs them without hunting through
 * projects/features. Mirrors FeaturePage's task-force row styling. */
export function InboxView({ onOpen }: { onOpen: (entry: InboxEntry) => void }) {
  const { data, isPending } = useInbox();
  const entries = data ?? [];

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Inbox</h1>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto custom-scroll p-6">
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {entries.map((entry) => (
              <div
                key={`${entry.project}::${entry.taskForceId}`}
                className="flex items-center gap-3 px-3 py-2.5 text-sm"
              >
                <AgentDot status={entry.status as AgentStatus} />
                <span className="truncate">
                  {entry.project} <span className="text-muted-foreground">›</span>{" "}
                  {entry.featureName} <span className="text-muted-foreground">›</span>{" "}
                  {entry.taskForceName}
                </span>
                <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
                  {entry.branch}
                </span>
                <Button size="sm" variant="secondary" onClick={() => onOpen(entry)}>
                  Open
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
