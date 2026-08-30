import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { statusLabels } from '@/utils/statusLabels';
import { ActionsDropdown } from '@/components/ui/actions-dropdown';
import {
  StatusGlyph,
  TaskStatusControl,
} from '@/components/tasks/TaskStatusControl';
import { TaskActivityBadge } from '@/components/tasks/TaskActivityBadge';
import { taskAccentClass } from '@/utils/taskAccent';

const COLLAPSED_KEY = 'kablan.listView.collapsedSections';

/**
 * Sections start collapsed if they were left that way, and Done starts collapsed on a first
 * visit: it is the group that grows without bound and the one you least often need to read.
 */
function loadCollapsed(): Set<TaskStatus> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (raw) return new Set(JSON.parse(raw) as TaskStatus[]);
  } catch {
    // Blocked or corrupt storage: fall through to the default.
  }
  return new Set<TaskStatus>(['done']);
}

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
 * Drag-to-reorder is deliberately not offered here: rows carry no drop targets. Status is
 * changed from the glyph on the left of each row, which is the same control the board card and
 * the task sidebar use.
 *
 * Sections collapse, and Done starts collapsed: it is the group that only ever grows, and the
 * one you scroll past rather than read. A collapsed heading still carries its count and whether
 * anything inside it is running.
 */
export function TaskListView({
  columns,
  order,
  selectedTaskId,
  onViewTaskDetails,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(loadCollapsed);

  const toggle = (status: TaskStatus) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // Blocked storage: the choice just won't persist.
      }
      return next;
    });
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-4">
      {order.map((status) => {
        const tasks = columns[status];
        // Skip empty groups: an empty column is meaningful on a board, but empty headings in a
        // list are just noise to scroll past.
        if (!tasks || tasks.length === 0) return null;
        const running = tasks.filter((t) => t.has_in_progress_attempt).length;

        const isCollapsed = collapsed.has(status);

        return (
          <section key={status} className={isCollapsed ? 'mb-3' : 'mb-8'}>
            {/* Mirrors a row: the same horizontal padding, the same 24px glyph box, and the
                same 2px accent stripe the rows carry — transparent here, but it occupies the
                width, and without it the heading's glyph sits 2px left of the rows'. The
                vertical padding is even, so the hover highlight reads as a band rather than
                something resting on the text. */}
            <button
              type="button"
              onClick={() => toggle(status)}
              aria-expanded={!isCollapsed}
              aria-controls={`tasks-${status}`}
              className="flex w-full items-center gap-3 border-b border-border border-l-2 border-l-transparent py-2 pl-3 pr-2 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className="-ml-1 inline-flex w-6 shrink-0 justify-center">
                <StatusGlyph status={status} />
              </span>
              <h3 className="font-ibm-plex-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {statusLabels[status]}
              </h3>
              <span className="font-ibm-plex-mono text-[11px] tabular-nums text-muted-foreground">
                {tasks.length}
              </span>
              {/* Surfaced on the heading so activity is visible without reading every row —
                  and so a collapsed section still says something is happening inside it. */}
              {running > 0 && (
                <span className="font-ibm-plex-mono text-[11px] tabular-nums text-info">
                  · {running} running
                </span>
              )}
              <ChevronRight
                className={`ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                  isCollapsed ? '' : 'rotate-90'
                }`}
                aria-hidden
              />
            </button>

            <ul id={`tasks-${status}`} hidden={isCollapsed}>
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
                    className={`flex items-center gap-3 border-b border-border py-3 pl-3 pr-2 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring ${taskAccentClass(
                      task
                    )} ${selectedTaskId === task.id ? 'bg-accent' : ''}`}
                  >
                    <TaskStatusControl task={task} className="-ml-1" />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      {task.description && (
                        <p className="truncate text-xs text-muted-foreground">
                          {task.description}
                        </p>
                      )}
                    </div>

                    <TaskActivityBadge task={task} />

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
