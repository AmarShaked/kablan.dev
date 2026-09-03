import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';

import type { UsageWindow } from 'shared/types';
import { Button } from '@/components/ui/button';
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
 * The reset time as the CLI worded it, minus the timezone it appends.
 *
 * The CLI has already resolved the time for this machine — 'Sep 7 at 8:59am
 * (Asia/Jerusalem)' — so the zone is true but redundant. It stays in the
 * `title`, for the one case where the app is being watched from elsewhere.
 */
function shortReset(resets: string): string {
  return resets.replace(/\s*\([^)]*\)\s*$/, '');
}

/** One window: what it is, how full it is, and when it rolls over. */
function WindowRow({ window: w }: { window: UsageWindow }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">{w.label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {Math.round(w.percent)}% used
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            barColor(w.percent)
          )}
          style={{ width: `${Math.min(Math.max(w.percent, 0), 100)}%` }}
        />
      </div>
      {w.resets && (
        <p
          className="text-xs text-muted-foreground"
          title={`Resets ${w.resets}`}
        >
          Resets {shortReset(w.resets)}
        </p>
      )}
    </div>
  );
}

/**
 * The Claude subscription rate-limit windows, as `claude /usage` reports them.
 *
 * The figures are read by asking the Claude Code CLI, which takes a few seconds
 * — so this asks once when the settings page is opened and then leaves it
 * alone. Nothing here changes minute to minute in a way worth a background
 * process, and the refresh button is there for when it does.
 */
export function UsageSection() {
  const queryClient = useQueryClient();

  const { data, error, isFetching } = useQuery({
    queryKey: usageKeys.all,
    queryFn: () => usageApi.get(),
    // Opening the page is the trigger. No interval: each read spawns the CLI.
    staleTime: 60_000,
    // A missing CLI or a logged-out one is a stable answer, not a blip.
    retry: false,
  });

  /**
   * A plain `refetch` would be answered from the backend's own minute-long
   * cache, so the button would often do nothing — it asks past that cache
   * instead, through the query so the result and any error land in one place.
   */
  async function refresh() {
    try {
      await queryClient.fetchQuery({
        queryKey: usageKeys.all,
        queryFn: () => usageApi.get(true),
        staleTime: 0,
      });
    } catch {
      // Already reflected in the query's error state, shown below.
    }
  }

  const windows = [
    ...(data?.session ? [data.session] : []),
    ...(data?.weekly ?? []),
  ];

  return (
    <div className="space-y-4">
      {windows.length > 0 && (
        <div className="space-y-4">
          {windows.map((w) => (
            <WindowRow key={w.label} window={w} />
          ))}
        </div>
      )}

      {/* Said plainly rather than drawn as an empty bar, which would read as
          plenty of headroom. Usually a CLI this machine has not logged into. */}
      {windows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {isFetching
            ? 'Reading usage from the Claude Code CLI…'
            : error instanceof Error
              ? error.message
              : 'No subscription usage to report on this machine.'}
        </p>
      )}

      {/* An error alongside figures means the refresh failed and these are the
          previous reading — worth saying, since they look current. */}
      {error && windows.length > 0 && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Could not refresh usage.'}
        </p>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => void refresh()}
        disabled={isFetching}
      >
        <RotateCw
          className={cn('mr-2 h-3.5 w-3.5', isFetching && 'animate-spin')}
        />
        {isFetching ? 'Reading…' : 'Refresh'}
      </Button>
    </div>
  );
}
