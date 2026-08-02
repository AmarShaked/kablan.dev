import { useMemo } from "react";
import { CheckCheck } from "lucide-react";
import { useInbox } from "../queries.ts";
import { useInboxRead, isRead } from "../lib/inboxRead.ts";
import { AgentDot } from "./AgentDot.tsx";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentStatus, InboxEntry } from "../api.ts";

/** Global attention inbox — every branch across every project that's awaiting input or has
 * failed, so the user has one place to see what needs them without hunting through projects.
 *
 * The inbox is derived from live agent statuses, so "read" is a client-side overlay (see
 * `lib/inboxRead.ts`): unread items sort first with normal styling; read items stay in the list
 * but are dimmed. Clicking an item marks it read and opens its cockpit; "Mark all read" dims the
 * whole list (dropping the rail's unread badge to 0). */
export function InboxView({ onOpen }: { onOpen: (entry: InboxEntry) => void }) {
  const { data, isPending } = useInbox();
  const { readSet, markRead, markAllRead } = useInboxRead();
  const entries = data ?? [];

  // Unread first (in original order), then read items — so what still needs the user stays on top.
  const sorted = useMemo(() => {
    const unread = entries.filter((e) => !isRead(readSet, e));
    const read = entries.filter((e) => isRead(readSet, e));
    return [...unread, ...read];
  }, [entries, readSet]);

  const unreadCount = entries.filter((e) => !isRead(readSet, e)).length;

  const open = (entry: InboxEntry) => {
    markRead([entry]);
    onOpen(entry);
  };

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Inbox</h1>
        {entries.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto gap-1.5 text-muted-foreground"
            disabled={unreadCount === 0}
            onClick={() => markAllRead(entries)}
          >
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto custom-scroll p-6">
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {sorted.map((entry) => {
              const read = isRead(readSet, entry);
              return (
                <div
                  key={`${entry.project}::${entry.branch}`}
                  data-read={read ? "true" : "false"}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 text-sm transition-opacity",
                    read && "opacity-50",
                  )}
                >
                  <AgentDot status={entry.status as AgentStatus} />
                  <span className="truncate">
                    {entry.project} <span className="text-muted-foreground">›</span>{" "}
                    {entry.featureName && (
                      <>
                        {entry.featureName} <span className="text-muted-foreground">›</span>{" "}
                      </>
                    )}
                    <span className="font-mono text-xs">{entry.branch}</span>
                  </span>
                  {read && <span className="text-xs text-muted-foreground">Read</span>}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="ml-auto"
                    onClick={() => open(entry)}
                  >
                    Open
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
