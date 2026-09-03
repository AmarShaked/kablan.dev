import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One rate-limit window, mirroring what the Claude CLI's `/usage` reports: a
 * share of the window consumed, and the moment it rolls over.
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
  /**
   * The rolling session window — the single bar the footer shows at rest,
   * because it is the limit that actually stops you mid-task.
   */
  session?: UsageWindow;
  /** Weekly windows. Held back until hover; pass none and hover just adds detail. */
  weekly?: UsageWindow[];
  onReload?: () => void;
  isLoading?: boolean;
}

/** Placeholder standing in for real `/usage` data — see the component doc. */
const MOCK_SESSION: UsageWindow = {
  label: 'Session',
  percent: 78,
  resetsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
};

const MOCK_WEEKLY: UsageWindow[] = [
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
 * A window rolling over within the day is a clock time ("3:00 PM"); anything
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

function WindowRow({
  window: w,
  showMeta,
}: {
  window: UsageWindow;
  showMeta: boolean;
}) {
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
            {w.percent}% · {formatReset(w.resetsAt)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The rate-limit windows the Claude CLI's `/usage` reports, at the foot of the
 * sidebar.
 *
 * At rest this is one bar: the session window, which is the limit that actually
 * interrupts work. The weekly windows matter when you are planning the week
 * rather than mid-task, so they stay out of the resting footer and arrive on
 * hover along with every window's numbers.
 *
 * NOTE: `session` and `weekly` are unpopulated in the app — the values below
 * are placeholders. Real `/usage` figures live on Anthropic's servers behind
 * the user's Claude subscription credentials, which this app holds no path to
 * (its own OAuth is for kablan's remote service). Wiring it up needs a data
 * source decision first.
 */
export function UsageGraph({
  session = MOCK_SESSION,
  weekly = MOCK_WEEKLY,
  onReload,
  isLoading = false,
}: UsageGraphProps) {
  const [showDetails, setShowDetails] = useState(false);

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
          <WindowRow window={session} showMeta={showDetails} />
          {showDetails &&
            weekly.map((w) => <WindowRow key={w.label} window={w} showMeta />)}
        </div>
      </div>
    </div>
  );
}
