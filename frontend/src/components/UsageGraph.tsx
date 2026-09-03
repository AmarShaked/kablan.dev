import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Usage data structure
 */
interface UsageData {
  current: number;
  limit: number;
  lastReset: Date;
}

interface UsageGraphProps {
  usage?: UsageData;
  onReload?: () => void;
  isLoading?: boolean;
}

/**
 * Sidebar usage graph showing current usage with hover details.
 * On hover displays current usage, limit, and last reset date.
 * Includes a reload button to refresh data.
 */
export function UsageGraph({ usage, onReload, isLoading = false }: UsageGraphProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Mock data if none provided
  const data = usage || {
    current: 45,
    limit: 100,
    lastReset: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
  };

  const percentage = (data.current / data.limit) * 100;

  // Determine color based on usage percentage
  const getColor = () => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  return (
    <div className="px-2 py-3 border-t border-sidebar-border">
      <div
        className="space-y-2 cursor-pointer"
        onMouseEnter={() => setShowDetails(true)}
        onMouseLeave={() => setShowDetails(false)}
      >
        {/* Header with title and reload button */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
            Usage
          </span>
          <button
            onClick={onReload}
            disabled={isLoading}
            className={cn(
              'p-1 rounded hover:bg-sidebar-accent transition-colors',
              'group-data-[collapsible=icon]:p-0',
              isLoading && 'opacity-50 cursor-not-allowed'
            )}
            title="Refresh usage data"
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

        {/* Graph bar */}
        <div className="space-y-1 group-data-[collapsible=icon]:hidden">
          <div className="h-1.5 bg-sidebar-accent rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-300', getColor())}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>

          {/* Details shown on hover */}
          {showDetails && (
            <div className="text-xs text-sidebar-foreground/70 space-y-0.5 animate-in fade-in duration-150">
              <div className="flex justify-between">
                <span>Usage:</span>
                <span className="font-medium">
                  {data.current} / {data.limit}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Percentage:</span>
                <span className="font-medium">{percentage.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Last reset:</span>
                <span className="font-medium">{formatDate(data.lastReset)}</span>
              </div>
            </div>
          )}

          {/* Compact view when not hovering */}
          {!showDetails && (
            <div className="text-xs text-sidebar-foreground/70">
              {data.current} / {data.limit}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
