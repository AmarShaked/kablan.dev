import { Skeleton } from '@/components/ui/skeleton';

/**
 * The task list's shape while it loads.
 *
 * Switching projects used to blank the column and then fill it, which reads as the app breaking
 * for a moment. This holds the layout instead — same header, same group rows, same indent for
 * the tasks — so the real list replaces it in place rather than pushing everything around.
 *
 * The paddings here are copied from TaskGroupSidebar deliberately; if they drift, the content
 * jumps at the moment it arrives, which is the one thing a skeleton exists to prevent.
 */

/** Enough groups and rows to fill the column, in the proportions a real project tends to have. */
const GROUPS = [3, 1, 2];

export function TaskGroupSidebarSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background" aria-busy>
      <div className="flex shrink-0 items-center gap-2 border-b border-border py-1.5 pl-3 pr-1.5">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-3 w-3 rounded-full" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-2 py-1.5">
        {GROUPS.map((rows, group) => (
          <section key={group} className="mb-2">
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
              <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-3" />
              <Skeleton className="ml-auto h-4 w-4 shrink-0" />
            </div>

            {Array.from({ length: rows }).map((_, row) => (
              <div key={row} className="flex items-center py-1 pl-8 pr-2">
                {/* Uneven widths: a column of identical bars reads as a loading graphic, a
                    ragged one reads as text that has not arrived. */}
                <Skeleton
                  className="h-4"
                  style={{ width: `${55 + ((group * 3 + row) % 4) * 12}%` }}
                />
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
