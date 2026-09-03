import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';

import type { UsageWindow } from 'shared/types';
import { usageApi } from '@/lib/api';
import { usageKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';

/** Green under 70%, amber to 90%, red above — the bar says "how close am I". */
function barColor(percent: number): string {
  if (percent >= 90) return 'bg-destructive';
  if (percent >= 70) return 'bg-warning';
  return 'bg-success';
}

/**
 * A window rolling over within the day is a clock time ("3:00 PM"); anything
 * further out is a weekday ("Thu"), since the hour stops being the useful part.
 */
function formatReset(resetsAt: string | null): string | null {
  if (!resetsAt) return null;
  const date = new Date(resetsAt);
  if (Number.isNaN(date.getTime())) return null;

  const msAway = date.getTime() - Date.now();
  if (msAway <= 0) return 'now';
  if (msAway < 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function WindowRow({
  window: w,
  showMeta,
}: {
  window: UsageWindow;
  showMeta: boolean;
}) {
  const reset = formatReset(w.resets_at);
  const percent = Math.round(w.percent);

  return (
    <div className="space-y-0.5">
      <div className="h-1.5 overflow-hidden rounded-full bg-sidebar-accent">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            barColor(w.percent)
          )}
          style={{ width: `${Math.min(Math.max(w.percent, 0), 100)}%` }}
        />
      </div>
      {showMeta && (
        <div className="flex justify-between gap-2 text-xs text-sidebar-foreground/70 animate-in fade-in duration-150">
          <span className="truncate">{w.label}</span>
          <span className="shrink-0 font-medium">
            {percent}%{reset ? ` · ${reset}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The Claude subscription rate-limit windows the CLI's `/usage` reports, at the
 * foot of the sidebar.
 *
 * At rest this is one bar: the session window, which is the limit that actually
 * interrupts work. The weekly windows matter when you are planning the week
 * rather than mid-task, so they stay out of the resting footer and arrive on
 * hover along with every window's numbers.
 *
 * The figures come from the backend, which reads them through the local Claude
 * Code CLI's credentials — so the footer stays empty until you have logged in
 * with that CLI, and says why on hover rather than drawing a misleading zero.
 */
export function UsageGraph() {
  const [showDetails, setShowDetails] = useState(false);

  const { data, error, isFetching, refetch } = useQuery({
    queryKey: usageKeys.all,
    queryFn: usageApi.get,
    // The windows move as work runs, but nothing pushes at this query, so it
    // asks about as often as a session window meaningfully shifts.
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    // A missing login is a stable answer, not a blip — retrying just spends
    // requests to be told the same thing.
    retry: false,
  });

  const session = data?.session ?? null;
  const weekly = data?.weekly ?? [];
  // Nothing to draw and no error yet: the first fetch is still out.
  const isEmpty = !session && weekly.length === 0;

  return (
    <div className="border-t border-sidebar-border px-2 py-3">
      <div
        className="space-y-2"
        onMouseEnter={() => setShowDetails(true)}
        onMouseLeave={() => setShowDetails(false)}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
            Usage
          </span>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className={cn(
              'rounded p-1 transition-colors hover:bg-sidebar-accent',
              'group-data-[collapsible=icon]:p-0',
              isFetching && 'cursor-not-allowed'
            )}
            title="Refresh usage"
            aria-label="Refresh usage"
          >
            <RotateCcw
              className={cn(
                'h-3 w-3 text-sidebar-foreground/70',
                isFetching && 'animate-spin'
              )}
            />
          </button>
        </div>

        <div className="space-y-1.5 group-data-[collapsible=icon]:hidden">
          {session && <WindowRow window={session} showMeta={showDetails} />}

          {showDetails &&
            weekly.map((w) => <WindowRow key={w.label} window={w} showMeta />)}

          {/* An empty track holds the footer's height steady while the first
              fetch is out, so the sidebar does not jump when it lands. */}
          {isEmpty && !error && (
            <div className="h-1.5 rounded-full bg-sidebar-accent" />
          )}

          {/* Why it is empty belongs on hover with everything else — usually a
              CLI login this machine does not have yet. */}
          {error && showDetails && (
            <p className="text-xs text-sidebar-foreground/70 animate-in fade-in duration-150">
              {error instanceof Error ? error.message : 'Usage unavailable'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
