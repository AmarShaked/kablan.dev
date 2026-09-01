import { useState, type ReactNode } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
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
import { statusLabels } from '@/utils/statusLabels';
import { StatusGlyph } from '@/components/tasks/TaskStatusControl';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const COLLAPSE_KEY = 'kablan.taskSidebar.groupCollapse';

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

function Indicator({
  label,
  short,
  children,
}: {
  /** The long form, for the tooltip and for screen readers. */
  label: string;
  /** The word beside the mark. A mark alone has to be learned; a word does not. */
  short: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Dot and word travel together as one unit, with the gap between chips wider than the
            gap inside one — that spacing is what separates them now the border is gone. */}
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-1.5 py-0.5"
          aria-label={label}
          role="img"
        >
          {children}
          {/* The dot carries the colour. Repeating it in the word makes three coloured labels
              competing with the title, which is the thing being read. */}
          <span className="text-xs text-muted-foreground">{short}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="px-2 py-1 text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A status dot.
 *
 * `pulse` is for the one state that is still changing while you look at it: a spinner says
 * "busy", a pulse says "alive", which is what you are checking when you glance at a list of
 * agents. It holds still for anyone who has asked the system for less motion.
 */
function Dot({ className, pulse }: { className: string; pulse?: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {pulse && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:animate-none',
            className
          )}
        />
      )}
      <span
        className={cn('relative inline-flex h-2 w-2 rounded-full', className)}
      />
    </span>
  );
}

function TaskRow({
  task,
  status,
  index,
  selected,
  onSelect,
}: {
  task: TaskWithAttemptStatus;
  status: TaskStatus;
  index: number;
  selected: boolean;
  onSelect: (task: TaskWithAttemptStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { index, parent: status },
  });

  return (
    <SidebarMenuItem>
      {/* asChild so the row keeps shadcn's menu-button styling — the rounded hover, the active
          fill, the truncation — while still being the drag handle and carrying its own
          indicators. A nested button inside a button would be invalid markup. */}
      <SidebarMenuButton
        asChild
        isActive={selected}
        className={cn('h-auto py-1.5', isDragging && 'opacity-40')}
      >
        <div
          ref={setNodeRef}
          onClick={() => onSelect(task)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(task);
            }
          }}
          {...listeners}
          {...attributes}
          className="cursor-pointer"
        >
          <span className="min-w-0 flex-1 truncate text-xs">{task.title}</span>

          {/* Three states, three marks. In a column this narrow a sentence costs more width
              than the title it sits under, and these are read by shape anyway. */}
          {task.has_running_dev_server && (
            <Indicator
              label="A dev server is running for this task"
              short="Server"
            >
              <Dot className="bg-info" />
            </Indicator>
          )}
          {task.last_attempt_failed && !task.has_in_progress_attempt && (
            <Indicator
              label="The last attempt for this task failed"
              short="Failed"
            >
              <Dot className="bg-destructive" />
            </Indicator>
          )}
          {task.has_in_progress_attempt && (
            <Indicator label="An agent is working on this task" short="Running">
              <Dot className="bg-success" pulse />
            </Indicator>
          )}
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function TaskGroup({
  status,
  tasks,
  isCollapsed,
  onToggle,
  selectedTaskId,
  onSelect,
}: {
  status: TaskStatus;
  tasks: TaskWithAttemptStatus[];
  isCollapsed: boolean;
  onToggle: () => void;
  selectedTaskId?: string;
  onSelect: (task: TaskWithAttemptStatus) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  const running = tasks.filter((t) => t.has_in_progress_attempt).length;
  // Groups collapse, so a group that hides the serving task has to say so itself — otherwise
  // the indicator only works when you already know where to look.
  const serving = tasks.some((t) => t.has_running_dev_server);

  return (
    <SidebarGroup
      ref={setNodeRef}
      className={cn(
        // The rule separates groups, not the tasks inside one — those are held apart by
        // spacing. The last group has nothing below it to be separated from.
        'border-b border-border/60 py-2.5 last:border-b-0',
        'transition-colors',
        // The whole group is the drop target, header included, so a collapsed group still
        // takes a task — otherwise moving one to Done would mean expanding Done first.
        isOver && 'rounded-lg bg-sidebar-accent/60'
      )}
    >
      <SidebarGroupLabel asChild>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!isCollapsed}
          aria-controls={`sidebar-tasks-${status}`}
          className="w-full gap-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <StatusGlyph status={status} size={14} className="shrink-0" />
          <span className="truncate text-sm font-medium">
            {statusLabels[status]}
          </span>
          <span className="text-sm tabular-nums opacity-60">
            {tasks.length}
          </span>
          {serving && <Dot className="ml-1 bg-info" />}
          {running > 0 && <Dot className="bg-success" pulse />}
          <ChevronRight
            className={cn(
              'ml-auto shrink-0 transition-transform',
              !isCollapsed && 'rotate-90'
            )}
            aria-hidden
          />
        </button>
      </SidebarGroupLabel>

      {!isCollapsed && (
        <SidebarGroupContent>
          {tasks.length === 0 ? (
            <p
              id={`sidebar-tasks-${status}`}
              className="mt-1.5 px-2 py-1.5 text-xs text-sidebar-foreground/50"
            >
              Drop a task here.
            </p>
          ) : (
            <SidebarMenu id={`sidebar-tasks-${status}`} className="mt-1.5 pl-2">
              {tasks.map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  status={status}
                  index={index}
                  selected={selectedTaskId === task.id}
                  onSelect={onSelect}
                />
              ))}
            </SidebarMenu>
          )}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
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
}: {
  columns: Record<TaskStatus, TaskWithAttemptStatus[]>;
  /** Readonly so the caller can pass its `as const` status tuple directly. */
  order: readonly TaskStatus[];
  selectedTaskId?: string;
  onSelect: (task: TaskWithAttemptStatus) => void;
  onCreateTask: () => void;
  /** Same handler the board uses: `over.id` is the status to move the task to. */
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const [overrides, setOverrides] = useState<CollapseOverrides>(loadOverrides);
  const [dragging, setDragging] = useState<TaskWithAttemptStatus | null>(null);

  // Same threshold the board uses: without it a click on a row registers as a tiny drag and the
  // task never opens.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const total = order.reduce((n, s) => n + (columns[s]?.length ?? 0), 0);

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
            <button
              type="button"
              onClick={onCreateTask}
              aria-label="Create new task"
              title="Create new task"
              className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
                  onSelect={onSelect}
                />
              );
            })}
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
