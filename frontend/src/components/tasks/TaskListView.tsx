import { Loader2, XCircle } from 'lucide-react';

import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { statusBoardColors, statusLabels } from '@/utils/statusLabels';
import { ActionsDropdown } from '@/components/ui/actions-dropdown';

type Props = {
  columns: Record<TaskStatus, TaskWithAttemptStatus[]>;
  /** Readonly so the caller can pass its `as const` status tuple directly. */
  order: readonly TaskStatus[];
  selectedTaskId?: string;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
};

/**
 * Tasks as a vertical list, grouped by status.
 *
 * The board is better for dragging work along; this is better for scanning a lot of tasks at
 * once, which is hard when five columns each scroll separately. Same information and the same
 * per-task actions — only the layout differs.
 *
 * Drag-to-reorder is deliberately not offered here: rows carry no drop targets, so status is
 * changed from the actions menu instead of by dragging.
 */
export function TaskListView({
  columns,
  order,
  selectedTaskId,
  onViewTaskDetails,
}: Props) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-4">
      {order.map((status) => {
        const tasks = columns[status];
        // Skip empty groups: an empty column is meaningful on a board, but empty headings in a
        // list are just noise to scroll past.
        if (!tasks || tasks.length === 0) return null;

        return (
          <section key={status} className="mb-8">
            <div className="flex items-baseline gap-2 border-b border-border pb-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: `hsl(var(${statusBoardColors[status]}))` }}
                aria-hidden
              />
              <h3 className="font-ibm-plex-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {statusLabels[status]}
              </h3>
              <span className="font-ibm-plex-mono text-[11px] tabular-nums text-muted-foreground">
                {tasks.length}
              </span>
            </div>

            <ul>
              {tasks.map((task) => (
                <li key={task.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onViewTaskDetails(task)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onViewTaskDetails(task);
                      }
                    }}
                    className={`flex items-center gap-3 border-b border-border px-2 py-3 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      selectedTaskId === task.id ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      {task.description && (
                        <p className="truncate text-xs text-muted-foreground">
                          {task.description}
                        </p>
                      )}
                    </div>

                    {task.has_in_progress_attempt && (
                      <Loader2
                        className="h-4 w-4 shrink-0 animate-spin text-info"
                        aria-label="Attempt running"
                      />
                    )}
                    {task.last_attempt_failed && (
                      <XCircle
                        className="h-4 w-4 shrink-0 text-destructive"
                        aria-label="Last attempt failed"
                      />
                    )}

                    <span
                      className="hidden shrink-0 text-xs text-muted-foreground sm:inline"
                      title={new Date(task.created_at).toLocaleString()}
                    >
                      {new Date(task.created_at).toLocaleDateString()}
                    </span>

                    {/* Stop propagation so opening the menu doesn't also open the task. */}
                    <span
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <ActionsDropdown task={task} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
