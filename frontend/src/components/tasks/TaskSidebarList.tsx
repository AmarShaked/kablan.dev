import { Loader2, SquareTerminal } from 'lucide-react';

import { TaskStatusControl } from '@/components/tasks/TaskStatusControl';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { statusLabels } from '@/utils/statusLabels';

/**
 * The task list shown beside an open task.
 *
 * Opening a task used to replace the board, so you lost sight of everything else. This keeps the
 * full list next to the conversation: the status glyph, the title, and what the task is doing
 * now — enough to switch between tasks, and to move one along, without going back.
 */

/** What the task is doing right now, in preference to a status word the glyph already carries. */
function activityLine(task: TaskWithAttemptStatus): string {
  if (task.has_in_progress_attempt) return 'Agent is working…';
  if (task.last_attempt_failed) return 'Last run failed';
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
            // A div rather than a button, so the status control can be a button inside it —
            // nesting one button in another is invalid and browsers drop the inner one.
            <div
              key={task.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(task)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(task);
                }
              }}
              className={`flex w-full cursor-pointer items-start gap-1.5 border-b border-border py-2.5 pl-2 pr-3 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                selectedTaskId === task.id ? 'bg-accent' : ''
              }`}
            >
              <TaskStatusControl task={task} className="mt-px" />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{task.title}</span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {activityLine(task)}
                  </span>
                  {/* The agent's own state, which the status glyph does not cover. */}
                  {task.has_in_progress_attempt && (
                    <Loader2
                      className="h-3 w-3 shrink-0 animate-spin text-info"
                      aria-label="Agent running"
                    />
                  )}
                  {task.has_running_dev_server && (
                    <SquareTerminal
                      className="h-3 w-3 shrink-0 text-success"
                      aria-label="Dev server running"
                    />
                  )}
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
