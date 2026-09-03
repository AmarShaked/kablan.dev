import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { userApi } from '@/lib/api';

/**
 * Usage data structure
 */
interface UsageData {
  current: number;
  limit: number;
  nextReset: Date;
}

interface UsageGraphProps {
  usage?: UsageData;
}

/**
 * Sidebar usage graph showing current usage with hover details.
 * On hover displays current usage, limit, and when it resets.
 * Includes a reload button to refresh data.
 */
export function UsageGraph({ usage }: UsageGraphProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [queryKey, setQueryKey] = useState(0);

  const { data: apiData, isLoading } = useQuery({
    queryKey: ['usageStats', queryKey],
    queryFn: () => userApi.getUsageStats(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleRefresh = () => {
    setQueryKey((prev) => prev + 1);
  };

  // Use provided data, API data, or mock fallback
  const data = usage
    ? usage
    : apiData
      ? {
          current: (apiData as any).current || 0,
          limit: (apiData as any).limit || 100,
          nextReset: new Date((apiData as any).next_reset),
        }
      : {
          current: 45,
          limit: 100,
          nextReset: new Date(Date.now() + 23 * 60 * 60 * 1000), // 23 hours from now
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
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (diffDays === 0) {
      if (diffHours === 1) return 'In 1 hour';
      if (diffHours < 24) return `In ${diffHours}h`;
      return 'Today';
    }
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `In ${diffDays} days`;
    if (diffDays < 30) return `In ${Math.floor(diffDays / 7)} weeks`;
    return `In ${Math.floor(diffDays / 30)} months`;
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
            onClick={handleRefresh}
            disabled={isLoading}
            className={cn(
              'p-1 rounded hover:bg-sidebar-accent transition-colors',
              'group-data-[collapsible=icon]:p-0',
              isLoading && 'cursor-not-allowed'
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
        <div className="group-data-[collapsible=icon]:hidden">
          <div className="h-1.5 bg-sidebar-accent rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-300', getColor())}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>

          {/* Details shown on hover */}
          {showDetails && (
            <div className="text-xs text-sidebar-foreground/70 space-y-0.5 mt-1 animate-in fade-in duration-150">
              <div className="flex justify-between">
                <span>Percentage:</span>
                <span className="font-medium">{percentage.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Next reset:</span>
                <span className="font-medium">{formatDate(data.nextReset)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
