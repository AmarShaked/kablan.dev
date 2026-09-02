import { useState, type ReactNode } from 'react';
import {
  Archive,
  ChevronRight,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
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
import {
  compareTasks,
  filtersActive,
  TaskFilterChips,
  TaskFilterMenu,
  TaskSortMenu,
  type TaskFilters,
  type TaskSort,
} from '@/components/tasks/TaskFilterMenu';
import { relativeDay } from '@/utils/relativeDay';
import { taskActivity, taskIsUnread } from '@/utils/taskActivity';
import { statusLabels } from '@/utils/statusLabels';
import {
  StatusGlyph,
  TaskStatusControl,
} from '@/components/tasks/TaskStatusControl';
import { TaskStatePills } from '@/components/tasks/TaskStatePills';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const COLLAPSE_KEY = 'kablan.taskSidebar.groupCollapse';
const GROUPING_KEY = 'kablan.taskSidebar.grouping';

/**
 * How the column is laid out: by status, or as one list newest first.
 *
 * Grouping answers "what is in review"; the flat list answers "what did I touch last", which is
 * the question when the statuses are not what you are navigating by.
 */
type Grouping = 'status' | 'none';

function loadGrouping(): Grouping {
  try {
    return localStorage.getItem(GROUPING_KEY) === 'none' ? 'none' : 'status';
  } catch {
    return 'status';
  }
}

/**
 * The groups the reader has explicitly opened or closed. Absent means "whatever the default is
 * for this group right now", which is what lets an empty group start closed and open itself the
 * moment a task lands in it.
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
 * An empty group is here to be dropped into, not read, so it starts out of the way. Done starts
 * closed for the opposite reason: it is the group that only ever grows.
 */
function defaultCollapsed(status: TaskStatus, count: number): boolean {
  return count === 0 || status === 'done';
}

/**
 * The two things you do to a row without opening it, on the hover the mail clients taught
 * everyone to expect: they take the place of the date, so the row keeps its shape and nothing
 * shifts under the pointer.
 *
 * Each button stops the pointer event as well as the click — the row is a drag handle, and a
 * press that reaches it starts a drag instead of pressing the button.
 */
function RowAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            danger && 'hover:bg-destructive/10 hover:text-destructive'
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="px-2 py-1 text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function TaskRow({
  task,
  status,
  index,
  selected,
  onSelect,
  onArchive,
  onDelete,
  showStatus,
}: {
  task: TaskWithAttemptStatus;
  status: TaskStatus;
  index: number;
  selected: boolean;
  onSelect: (task: TaskWithAttemptStatus) => void;
  onArchive?: (task: TaskWithAttemptStatus) => void;
  onDelete?: (task: TaskWithAttemptStatus) => void;
  /** Ungrouped, the row carries its own status — there is no header saying it. */
  showStatus?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { index, parent: status },
  });

  const activity = taskActivity(task);
  const unread = taskIsUnread(task);

  // Ungrouped there is nothing to drop into, so the row is not a drag handle either.
  const dragHandle = showStatus ? {} : listeners;
  const hasActions = !!onArchive || !!onDelete;

  return (
    <li>
      <div
        ref={setNodeRef}
        // `attributes` already carries role and tabIndex — dnd-kit makes the handle focusable
        // and announceable, so the row is keyboard-reachable without a second set here.
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(task)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(task);
          }
        }}
        {...dragHandle}
        {...attributes}
        className={cn(
          'group/row flex cursor-pointer items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted',
          selected && 'bg-muted',
          isDragging && 'opacity-40'
        )}
      >
        {/* The status, and the way to change it — a control, not a picture, in both layouts.
            It stops the pointer itself, so pressing it opens the menu rather than starting a
            drag or opening the task. */}
        <TaskStatusControl task={task} size={16} className="-ml-1 mt-px" />
        <div className="min-w-0 flex-1 space-y-[5px]">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                unread ? 'font-bold' : 'font-semibold'
              )}
            >
              {task.title}
              {unread && <span className="sr-only"> (unread)</span>}
            </span>
            <div className="relative flex shrink-0 items-center">
              <span
                className={cn(
                  'text-[13px] leading-[18px] tabular-nums text-muted-foreground transition-opacity',
                  hasActions && 'group-hover/row:opacity-0'
                )}
              >
                {relativeDay(task.updated_at)}
              </span>
              {hasActions && (
                // Hover only: a selected row keeps focus, and buttons that linger on the
                // row you are reading read as part of it rather than as a passing offer.
                <div className="pointer-events-none absolute right-0 flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover/row:pointer-events-auto group-hover/row:opacity-100">
                  {onArchive && (
                    <RowAction
                      label="Archive task"
                      onClick={() => onArchive(task)}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </RowAction>
                  )}
                  {onDelete && (
                    <RowAction
                      label="Delete task"
                      danger
                      onClick={() => onDelete(task)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </RowAction>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Always a second line, so the list keeps one rhythm and nothing jumps when a task
              wakes up. The sentence takes the room it can; the pills keep the right. */}
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-[13px] leading-[18px] text-muted-foreground',
                !activity && 'italic opacity-75'
              )}
            >
              {activity ?? "Agent hasn't started yet"}
            </span>
            <TaskStatePills task={task} />
          </div>
        </div>
      </div>
    </li>
  );
}

function TaskGroup({
  status,
  tasks,
  isCollapsed,
  onToggle,
  selectedTaskId,
  onSelect,
  onArchive,
  onDelete,
}: {
  status: TaskStatus;
  tasks: TaskWithAttemptStatus[];
  isCollapsed: boolean;
  onToggle: () => void;
  selectedTaskId?: string;
  onSelect: (task: TaskWithAttemptStatus) => void;
  onArchive?: (task: TaskWithAttemptStatus) => void;
  onDelete?: (task: TaskWithAttemptStatus) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  return (
    // Each status is its own card, so the boundary between groups is the edge of a surface
    // rather than a rule drawn across a flat list.
    <section
      ref={setNodeRef}
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-colors dark:bg-muted',
        // The whole card is the drop target, header included, so a collapsed group still
        // takes a task — otherwise moving one to Done would mean expanding Done first.
        isOver && 'border-primary/60 ring-2 ring-primary/20'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        aria-controls={`sidebar-tasks-${status}`}
        className={cn(
          'flex min-h-11 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-muted/60',
          // A rule under the header only separates it from something. Collapsed, it is the card.
          !isCollapsed && 'border-b border-border'
        )}
      >
        <StatusGlyph status={status} size={14} className="shrink-0" />
        <h3 className="truncate text-sm font-semibold leading-none tracking-tight">
          {statusLabels[status]}
        </h3>
        <span className="text-xs tabular-nums text-muted-foreground">
          ({tasks.length})
        </span>
        <ChevronRight
          className={cn(
            'ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            !isCollapsed && 'rotate-90'
          )}
          aria-hidden
        />
      </button>

      {!isCollapsed &&
        (tasks.length === 0 ? (
          <p
            id={`sidebar-tasks-${status}`}
            className="px-3 py-3 text-xs text-muted-foreground"
          >
            Drop a task here.
          </p>
        ) : (
          <ul id={`sidebar-tasks-${status}`} className="space-y-2 p-2">
            {tasks.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                status={status}
                index={index}
                selected={selectedTaskId === task.id}
                onSelect={onSelect}
                onArchive={onArchive}
                onDelete={onDelete}
              />
            ))}
          </ul>
        ))}
    </section>
  );
}

/**
 * Every task in the project, grouped by status, beside whatever you have open.
 *
 * The board and the full-width list each answered "show me everything" by taking the whole
 * window, so opening a task meant losing sight of the rest and going back meant leaving what you
 * were reading. This is the one view instead: the list is always there, the conversation and the
 * details are always there, and moving between tasks costs a click rather than a round trip.
 *
 * It keeps what the group cards had — the status colour, the counts, collapse with Done and the
 * empty groups closed, and drag between groups to change status — at the width a column can
 * afford.
 */
export function TaskGroupSidebar({
  columns,
  order,
  selectedTaskId,
  onSelect,
  onCreateTask,
  onDragEnd,
  onArchiveTask,
  onDeleteTask,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  statusCounts,
  needsMeCount,
}: {
  columns: Record<TaskStatus, TaskWithAttemptStatus[]>;
  /** Readonly so the caller can pass its `as const` status tuple directly. */
  order: readonly TaskStatus[];
  selectedTaskId?: string;
  onSelect: (task: TaskWithAttemptStatus) => void;
  onCreateTask: () => void;
  /** Same handler the board uses: `over.id` is the status to move the task to. */
  onDragEnd: (event: DragEndEvent) => void;
  /** Row hover actions. Omit one and its button is not drawn. */
  onArchiveTask?: (task: TaskWithAttemptStatus) => void;
  onDeleteTask?: (task: TaskWithAttemptStatus) => void;
  /** Which tasks the page is showing, and in what order. The page owns both. */
  filters: TaskFilters;
  onFiltersChange: (next: TaskFilters) => void;
  sort: TaskSort;
  onSortChange: (next: TaskSort) => void;
  /** How many tasks each status holds before the status filter narrows the list — otherwise the
   *  menu would show 0 beside every status you are not currently looking at. */
  statusCounts: Record<TaskStatus, number>;
  /** How many tasks are waiting on the reader, shown against the "Needs me" toggle. */
  needsMeCount?: number;
}) {
  const [overrides, setOverrides] = useState<CollapseOverrides>(loadOverrides);
  const [grouping, setGrouping] = useState<Grouping>(loadGrouping);
  const [dragging, setDragging] = useState<TaskWithAttemptStatus | null>(null);

  // Same threshold the board uses: without it a click on a row registers as a tiny drag and the
  // task never opens.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const total = order.reduce((n, s) => n + (columns[s]?.length ?? 0), 0);

  // Ungrouped, the groups' own ordering has to become one list — the same comparator, applied
  // across statuses instead of inside each.
  const flat = order
    .flatMap((status) => columns[status] ?? [])
    .sort(compareTasks(sort));

  const chooseGrouping = (next: Grouping) => {
    setGrouping(next);
    try {
      localStorage.setItem(GROUPING_KEY, next);
    } catch {
      // Blocked storage: the choice just won't persist.
    }
  };

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
    <TooltipProvider delayDuration={200} skipDelayDuration={400}>
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
        <div className="flex h-full min-h-0 flex-col bg-background">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
            <span className="text-sm font-medium">Tasks</span>
            <span className="font-ibm-plex-mono text-[11px] tabular-nums text-muted-foreground">
              {total}
            </span>

            <TaskFilterChips
              value={filters}
              onChange={onFiltersChange}
              className="overflow-hidden"
            />

            {/* The controls hold the right edge whether or not a chip is there to push them. */}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <TaskFilterMenu
                value={filters}
                onChange={onFiltersChange}
                counts={statusCounts}
                needsMeCount={needsMeCount}
              />
              <TaskSortMenu value={sort} onChange={onSortChange} />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Display options"
                    title="Display options"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Grouping
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={grouping}
                    onValueChange={(v) => chooseGrouping(v as Grouping)}
                  >
                    <DropdownMenuRadioItem value="status" className="text-sm">
                      Status
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="none" className="text-sm">
                      No grouping
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                onClick={onCreateTask}
                aria-label="Create new task"
                title="Create new task"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {grouping === 'none' ? (
              // No card here: the border of a card is what separates one group from the next,
              // and ungrouped there is nothing to separate — just the rows on the page.
              <ul className="space-y-2">
                {flat.map((task, index) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    status={task.status}
                    index={index}
                    selected={selectedTaskId === task.id}
                    onSelect={onSelect}
                    onArchive={onArchiveTask}
                    onDelete={onDeleteTask}
                    showStatus
                  />
                ))}
              </ul>
            ) : (
              order.map((status) => {
                const tasks = columns[status] ?? [];
                // An empty group is a drop target — worth keeping, until a filter is on: then it
                // is a status you asked not to see, and it should not take up a card.
                if (tasks.length === 0 && filtersActive(filters)) return null;
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
                    onSelect={onSelect}
                    onArchive={onArchiveTask}
                    onDelete={onDeleteTask}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Just the title: a full-width copy of the row would cover the group you are aiming at. */}
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="max-w-xs truncate border border-border bg-background px-2 py-1.5 text-xs font-medium shadow-lg">
              {dragging.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </TooltipProvider>
  );
}
