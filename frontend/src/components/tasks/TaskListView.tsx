import { useState } from 'react';
import { ChevronRight, GripVertical } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { statusLabels, statusColorVars } from '@/utils/statusLabels';
import { ActionsDropdown } from '@/components/ui/actions-dropdown';
import { TaskStatusControl } from '@/components/tasks/TaskStatusControl';
import { TaskActivityBadge } from '@/components/tasks/TaskActivityBadge';
import { taskAccentClass } from '@/utils/taskAccent';

const COLLAPSE_KEY = 'kablan.listView.groupCollapse';

/**
 * The groups the reader has explicitly opened or closed. Absent means "whatever the default is
 * for this group right now" — which is what lets an empty group start closed and then open on
 * its own the moment something lands in it.
 */
type CollapseOverrides = Partial<Record<TaskStatus, boolean>>;

function loadOverrides(): CollapseOverrides {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) return JSON.parse(raw) as CollapseOverrides;
  } catch {
    // Blocked or corrupt storage: fall through to the defaults.
  }
  return {};
}

/**
 * An empty group is on the page to be dropped into, not to be read, so it starts out of the way.
 * Done starts closed for the opposite reason: it is the group that only ever grows.
 */
function defaultCollapsed(status: TaskStatus, count: number): boolean {
  return count === 0 || status === 'done';
}

/**
 * What a group of tasks is doing, counted once so the header and its bar agree.
 *
 * The group is already one status — that is what it is grouped by — so the status tells you
 * nothing you cannot read off the heading. What varies inside a group is whether the work is
 * moving: an "In Review" of six where two agents are still running is a different thing from six
 * that have all stopped, and the heading is where that should be readable without expanding.
 */
type GroupActivity = {
  total: number;
  running: number;
  failed: number;
  servers: number;
  idle: number;
};

function summarise(tasks: TaskWithAttemptStatus[]): GroupActivity {
  let running = 0;
  let failed = 0;
  let servers = 0;
  for (const task of tasks) {
    // One task, one segment — a task whose attempt is running and whose dev server is up is
    // counted as running, the more urgent of the two, so the segments sum to the total.
    if (task.has_in_progress_attempt) running += 1;
    else if (task.last_attempt_failed) failed += 1;
    else if (task.has_running_dev_server) servers += 1;
  }
  return {
    total: tasks.length,
    running,
    failed,
    servers,
    idle: tasks.length - running - failed - servers,
  };
}

/** The activity mix as one bar, in the group's own row. */
function ActivityBar({ activity }: { activity: GroupActivity }) {
  const segments = [
    {
      key: 'running',
      n: activity.running,
      className: 'bg-info/70',
      label: 'running',
    },
    {
      key: 'failed',
      n: activity.failed,
      className: 'bg-destructive/70',
      label: 'last run failed',
    },
    {
      key: 'servers',
      n: activity.servers,
      className: 'bg-success/70',
      label: 'dev server up',
    },
    {
      key: 'idle',
      n: activity.idle,
      className: 'bg-muted-foreground/15',
      label: 'idle',
    },
  ].filter((segment) => segment.n > 0);

  // An empty group has no mix to show, but the bar still holds its place so the headers of
  // adjacent groups line up.
  if (activity.total === 0) {
    return (
      <span className="flex h-1.5 w-full bg-muted-foreground/10" aria-hidden />
    );
  }

  return (
    <span
      className="flex h-1.5 w-full overflow-hidden"
      role="img"
      aria-label={segments
        .map((segment) => `${segment.n} ${segment.label}`)
        .join(', ')}
    >
      {segments.map((segment) => (
        <span
          key={segment.key}
          className={segment.className}
          style={{ width: `${(segment.n / activity.total) * 100}%` }}
          title={`${segment.n} ${segment.label}`}
        />
      ))}
    </span>
  );
}

/**
 * One task, draggable to another group.
 *
 * The whole row is the handle rather than a grip on the end, because a row is a big target and
 * a grip is a small one — but the grip is still drawn on hover, since a row that can be dragged
 * and doesn't say so is a feature nobody finds. The two controls inside the row stop pointer
 * events reaching the drag listener, or opening the status picker would begin a drag instead.
 */
function TaskRow({
  task,
  status,
  index,
  selected,
  onViewTaskDetails,
}: {
  task: TaskWithAttemptStatus;
  status: TaskStatus;
  index: number;
  selected: boolean;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { index, parent: status },
  });

  return (
    <li className="[&:last-child>div]:border-b-0">
      <div
        ref={setNodeRef}
        onClick={() => onViewTaskDetails(task)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onViewTaskDetails(task);
          }
        }}
        {...listeners}
        {...attributes}
        className={`group flex items-center gap-3 border-b border-border py-3 pl-2 pr-2 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring ${taskAccentClass(
          task
        )} ${selected ? 'bg-accent' : ''} ${
          // The row stays in place and goes quiet: the overlay is what follows the cursor.
          isDragging ? 'opacity-40' : ''
        }`}
      >
        <GripVertical
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60"
          aria-hidden
        />

        {/* dnd-kit starts a drag on pointer-down, which is also when the picker opens. */}
        <span className="shrink-0" onPointerDown={(e) => e.stopPropagation()}>
          <TaskStatusControl task={task} />
        </span>

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

        {/* Stop propagation so opening the menu doesn't also open the task or start a drag. */}
        <span
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <ActionsDropdown task={task} />
        </span>
      </div>
    </li>
  );
}

/**
 * One status group: its card, its tasks, and the area you can drop a task into.
 *
 * The whole group is the drop target, header included, so a collapsed group still accepts a
 * task — otherwise moving something to Done would mean expanding Done first.
 */
function TaskGroup({
  status,
  tasks,
  isCollapsed,
  onToggle,
  selectedTaskId,
  onViewTaskDetails,
}: {
  status: TaskStatus;
  tasks: TaskWithAttemptStatus[];
  isCollapsed: boolean;
  onToggle: () => void;
  selectedTaskId?: string;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  const activity = summarise(tasks);
  // Softened: at full strength five saturated stripes down the page compete with the content
  // they are meant to label.
  const color = `hsl(var(${statusColorVars[status]}) / 0.55)`;

  return (
    <section
      ref={setNodeRef}
      className={`mb-4 border transition-colors ${
        isOver ? 'border-foreground/30 bg-accent/40' : 'border-border'
      }`}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      {/* The group's own card. Everything the group can say about itself lives here, so a
          collapsed group is still worth reading: how much work is in it, how much is moving,
          and the mix as a bar you can take in without counting. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        aria-controls={`tasks-${status}`}
        className="flex w-full items-stretch text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 pr-3">
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
              isCollapsed ? '' : 'rotate-90'
            }`}
            aria-hidden
          />

          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {statusLabels[status]}
            </span>
            <span className="font-ibm-plex-mono block text-xs tabular-nums text-muted-foreground">
              {activity.total === 0
                ? 'empty'
                : `${activity.total} ${activity.total === 1 ? 'task' : 'tasks'}`}
              {activity.running > 0 && ` / ${activity.running} running`}
              {activity.failed > 0 && ` / ${activity.failed} failed`}
              {activity.servers > 0 && ` / ${activity.servers} serving`}
            </span>
          </span>

          <span className="ml-auto hidden w-56 shrink-0 sm:block">
            <span className="font-ibm-plex-mono mb-1 block text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Activity
            </span>
            <ActivityBar activity={activity} />
          </span>
        </span>
      </button>

      {!isCollapsed &&
        (tasks.length === 0 ? (
          // An empty group is kept rather than skipped: it is where you drop a task to move it
          // here, and it cannot be that if it isn't on the page.
          <p
            id={`tasks-${status}`}
            className="border-t border-border px-3 py-4 text-center text-xs text-muted-foreground"
          >
            Nothing here. Drop a task to move it to {statusLabels[status]}.
          </p>
        ) : (
          <ul id={`tasks-${status}`} className="border-t border-border">
            {tasks.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                status={status}
                index={index}
                selected={selectedTaskId === task.id}
                onViewTaskDetails={onViewTaskDetails}
              />
            ))}
          </ul>
        ))}
    </section>
  );
}

type Props = {
  columns: Record<TaskStatus, TaskWithAttemptStatus[]>;
  /** Readonly so the caller can pass its `as const` status tuple directly. */
  order: readonly TaskStatus[];
  selectedTaskId?: string;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  /** Same handler the board uses: `over.id` is the status to move the task to. */
  onDragEnd: (event: DragEndEvent) => void;
};

/**
 * Tasks as a vertical list, grouped by status.
 *
 * The board is better for seeing five columns at once; this is better for reading a lot of tasks
 * in a row, which is hard when each column scrolls separately. Same information, same per-task
 * actions, and — now — the same drag between statuses, so choosing this view no longer costs you
 * the one thing the board could do that this could not.
 *
 * Every status gets a group, including the empty ones: an empty group is what you drop a task
 * into to move it there, so skipping it would take the feature away exactly when it is needed.
 *
 * Groups collapse. Empty ones and Done start that way — the first because it is a drop target
 * rather than something to read, the second because it only ever grows — but that is a default,
 * not a memory: open one and it stays open, and an empty group opens itself the moment a task
 * lands in it. A collapsed group still carries its counts and its activity bar, and still
 * accepts a drop.
 */
export function TaskListView({
  columns,
  order,
  selectedTaskId,
  onViewTaskDetails,
  onDragEnd,
}: Props) {
  const [overrides, setOverrides] = useState<CollapseOverrides>(loadOverrides);
  const [dragging, setDragging] = useState<TaskWithAttemptStatus | null>(null);

  // Same threshold the board uses: without it, a click on a row would register as a tiny drag
  // and the row would never open.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const toggle = (status: TaskStatus, isCollapsed: boolean) => {
    setOverrides((prev) => {
      const next = { ...prev, [status]: !isCollapsed };
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        // Blocked storage: the choice just won't persist.
      }
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    setDragging(
      order
        .flatMap((status) => columns[status] ?? [])
        .find((t) => t.id === id) ?? null
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragEnd={(event) => {
        setDragging(null);
        onDragEnd(event);
      }}
      onDragCancel={() => setDragging(null)}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-4">
        {order.map((status) => {
          const tasks = columns[status] ?? [];
          const isCollapsed =
            overrides[status] ?? defaultCollapsed(status, tasks.length);
          return (
            <TaskGroup
              key={status}
              status={status}
              tasks={tasks}
              isCollapsed={isCollapsed}
              onToggle={() => toggle(status, isCollapsed)}
              selectedTaskId={selectedTaskId}
              onViewTaskDetails={onViewTaskDetails}
            />
          );
        })}
      </div>

      {/* What follows the cursor. Just the title: the row's own controls would be inert here,
          and a full-width copy of the row obscures the group you are aiming at. */}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="max-w-sm truncate border border-border bg-background px-3 py-2 text-sm font-medium shadow-lg">
            {dragging.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
