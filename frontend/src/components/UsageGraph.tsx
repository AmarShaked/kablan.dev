import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One rate-limit window, mirroring what the Claude CLI's `/usage` reports: a
 * percentage of the window consumed, and the moment the window rolls over.
 *
 * `/usage` shows several of these at once rather than a single quota — a rolling
 * session window plus weekly windows — which is why this is a list and not one
 * current/limit pair.
 */
export interface UsageWindow {
  /** Short label, e.g. 'Session', 'Week', 'Week (Opus)'. */
  label: string;
  /** 0–100. */
  percent: number;
  /** When this window rolls over. */
  resetsAt: Date;
}

interface UsageGraphProps {
  /** Omit to render the placeholder windows below. */
  windows?: UsageWindow[];
  onReload?: () => void;
  isLoading?: boolean;
}

/**
 * Placeholder standing in for real `/usage` data, which this app cannot reach
 * yet — see the note in the component doc comment.
 */
const MOCK_WINDOWS: UsageWindow[] = [
  {
    label: 'Session',
    percent: 78,
    resetsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  },
  {
    label: 'Week',
    percent: 31,
    resetsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
  },
  {
    label: 'Week (Opus)',
    percent: 12,
    resetsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
  },
];

/** Green under 70%, amber to 90%, red above — the bar says "how close am I". */
function barColor(percent: number): string {
  if (percent >= 90) return 'bg-destructive';
  if (percent >= 70) return 'bg-warning';
  return 'bg-success';
}

/**
 * A window rolling over within a day is a clock time ("3:00 PM"); anything
 * further out is a weekday ("Thu"), since the hour stops being the useful part.
 */
function formatReset(date: Date): string {
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

/**
 * The rate-limit windows the Claude CLI's `/usage` reports, at the foot of the
 * sidebar: one thin bar per window, with the numbers on hover.
 *
 * Collapsed to bars by default because the point at a glance is "how much
 * headroom is left", which a bar answers without being read. The labels,
 * percentages and reset times are what you want once you've noticed a bar is
 * full, so they wait for the hover.
 *
 * NOTE: `windows` is currently unpopulated in the app — these numbers are
 * placeholders. Real `/usage` data lives on Anthropic's servers behind the
 * user's Claude subscription credentials, which this app holds no path to (its
 * own OAuth is for kablan's remote service). Wiring it up needs a data source
 * decision first; see the sidebar's usage TODO.
 */
export function UsageGraph({
  windows,
  onReload,
  isLoading = false,
}: UsageGraphProps) {
  const [showDetails, setShowDetails] = useState(false);
  const data = windows ?? MOCK_WINDOWS;

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
            onClick={onReload}
            disabled={isLoading}
            className={cn(
              'rounded p-1 transition-colors hover:bg-sidebar-accent',
              'group-data-[collapsible=icon]:p-0',
              isLoading && 'cursor-not-allowed'
            )}
            title="Refresh usage"
            aria-label="Refresh usage"
          >
            <RotateCcw
              className={cn(
                'h-3 w-3 text-sidebar-foreground/70',
                isLoading && 'animate-spin'
              )}
            />
          </button>
        </div>

        <div className="space-y-1.5 group-data-[collapsible=icon]:hidden">
          {data.map((w) => (
            <div key={w.label} className="space-y-0.5">
              {/* The bar alone in the resting state; the row of numbers below
                  it only exists on hover, so the footer stays quiet. */}
              <div className="h-1.5 overflow-hidden rounded-full bg-sidebar-accent">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    barColor(w.percent)
                  )}
                  style={{ width: `${Math.min(Math.max(w.percent, 0), 100)}%` }}
                />
              </div>
              {showDetails && (
                <div className="flex justify-between gap-2 text-xs text-sidebar-foreground/70 animate-in fade-in duration-150">
                  <span className="truncate">{w.label}</span>
                  <span className="shrink-0 font-medium">
                    {w.percent}% · {formatReset(w.resetsAt)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
