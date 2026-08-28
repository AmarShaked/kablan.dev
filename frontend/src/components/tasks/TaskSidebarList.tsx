import { Check, CircleDashed, Loader2, SquareTerminal, X } from 'lucide-react';

import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { statusLabels } from '@/utils/statusLabels';

/**
 * The task list shown beside an open task.
 *
 * Opening a task used to replace the board, so you lost sight of everything else. This keeps the
 * full list next to the conversation: a state glyph, the title, what the task is doing now, and
 * the status — enough to switch between tasks without going back.
 */

function StateGlyph({
  task,
}: {
  task: TaskWithAttemptStatus;
}) {
  const cls = 'h-3.5 w-3.5 shrink-0';
  if (task.has_in_progress_attempt)
    return <Loader2 className={`${cls} animate-spin text-info`} aria-label="Attempt running" />;
  if (task.last_attempt_failed)
    return <X className={`${cls} text-destructive`} aria-label="Last attempt failed" />;
  if (task.status === 'done')
    return <Check className={`${cls} text-success`} aria-label="Done" />;
  if (task.status === 'cancelled')
    return <X className={`${cls} text-muted-foreground`} aria-label="Cancelled" />;
  return <CircleDashed className={`${cls} text-muted-foreground`} aria-label={statusLabels[task.status]} />;
}

/** What the task is doing right now, in preference to a status word that repeats the glyph. */
function activityLine(task: TaskWithAttemptStatus): string {
  if (task.has_in_progress_attempt) return 'Agent is working…';
  if (task.last_attempt_failed) return 'Last attempt failed';
  return statusLabels[task.status];
}

export function TaskSidebarList({
  tasksByStatus,
  order,
  selectedTaskId,
  onSelect,
}: {
  tasksByStatus: Record<TaskStatus, TaskWithAttemptStatus[]>;
  order: readonly TaskStatus[];
  selectedTaskId?: string;
  onSelect: (task: TaskWithAttemptStatus) => void;
}) {
  const tasks = order.flatMap((status) => tasksByStatus[status] ?? []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-medium">Tasks</span>
        <span className="font-ibm-plex-mono text-[11px] tabular-nums text-muted-foreground">
          {tasks.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">No tasks.</p>
        ) : (
          tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onSelect(task)}
              className={`flex w-full items-start gap-2 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                selectedTaskId === task.id ? 'bg-accent' : ''
              }`}
            >
              <span className="mt-0.5">
                <StateGlyph task={task} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{task.title}</span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {activityLine(task)}
                  </span>
                  {task.has_running_dev_server && (
                    <SquareTerminal
                      className="h-3 w-3 shrink-0 text-success"
                      aria-label="Dev server running"
                    />
                  )}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
