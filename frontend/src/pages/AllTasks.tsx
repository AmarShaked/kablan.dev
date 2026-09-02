import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  ListFilter,
  Loader2,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';

import {
  StatusGlyph,
  TaskStatusControl,
} from '@/components/tasks/TaskStatusControl';
import { TaskStatePills } from '@/components/tasks/TaskStatePills';
import { projectIcon } from '@/components/projects/projectIcons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/dialogs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAllTasks, type TaskAcrossProjects } from '@/hooks/useAllTasks';
import { tasksApi } from '@/lib/api';
import { paths } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { relativeDay } from '@/utils/relativeDay';
import { taskActivity, taskIsUnread } from '@/utils/taskActivity';
import { STATUS_ORDER, statusLabels } from '@/utils/statusLabels';
import type { ArchiveFilter, TaskStatus } from 'shared/types';

/**
 * Every task, across every project, grouped by status.
 *
 * The board answers "what is happening in this project"; this answers "what is happening", which
 * is the question you have before you know which project to open. It is a list rather than a
 * board because the point is to scan states in one column and click through, not to move work
 * between them — dragging happens on the project's own board, where the statuses belong to one
 * thing.
 *
 * A row goes to the task in its project, so the destination is the full view with its
 * conversation and details, not a second half-featured place to read a task.
 */

/** Newest first: a list this long is read from the top, and recent work is what you came for. */
function byRecency(a: TaskAcrossProjects, b: TaskAcrossProjects) {
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

/**
 * One task, as the row a mail list uses: title and time on the first line, where it comes from
 * on the second, and the two things you can do to it without opening it on hover.
 */
function Row({
  task,
  selected,
  onToggle,
  onOpen,
  onArchive,
  onDelete,
}: {
  task: TaskAcrossProjects;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: (task: TaskAcrossProjects) => void;
  /** Archiving flips: an archived row is restored, not archived again. */
  onArchive: (task: TaskAcrossProjects, archived: boolean) => void;
  onDelete: (task: TaskAcrossProjects) => void;
}) {
  const activity = taskActivity(task);
  const unread = taskIsUnread(task);
  const ProjectGlyph = projectIcon(task.projectIcon);

  return (
    <li
      className={cn(
        // The row is the whole card-width target, and the hover tint is the only thing
        // separating one from the next — no rules between rows.
        'group/row relative flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted',
        selected && 'bg-muted'
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={() => onToggle(task.id)}
        aria-label={`Select ${task.title}`}
        className={cn(
          'shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100',
          selected && 'opacity-100'
        )}
      />

      {/* The status, and the way to change it. This list spans projects, so the control is told
          which one the task belongs to rather than reading it off the route. */}
      <TaskStatusControl
        task={task}
        projectId={task.projectId}
        size={16}
        className="-ml-0.5"
      />

      <button
        type="button"
        onClick={() => onOpen(task)}
        className="min-w-0 flex-1 space-y-[5px] text-left"
      >
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

          {/* Hidden under the hover actions, which take this corner of the row. */}
          <span className="shrink-0 text-[13px] leading-[18px] tabular-nums text-muted-foreground transition-opacity group-hover/row:opacity-0">
            {relativeDay(task.updated_at)}
          </span>
        </div>

        {/* Always a second line: which project, what last happened, and what is true now. */}
        <div className="flex min-w-0 items-center gap-2 text-[13px] leading-[18px] text-muted-foreground">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-1.5 py-px leading-4">
            <ProjectGlyph className="h-3 w-3" aria-hidden />
            {task.projectName}
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              !activity && 'italic opacity-75'
            )}
          >
            {activity ?? "Agent hasn't started yet"}
          </span>
          <TaskStatePills task={task} />
        </div>
      </button>

      {/* Outside the row button — a button cannot hold buttons. Hover only: a row
          that keeps focus should not keep the buttons with it. */}
      <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover/row:pointer-events-auto group-hover/row:opacity-100">
        <button
          type="button"
          aria-label={task.archived_at ? 'Restore task' : 'Archive task'}
          title={task.archived_at ? 'Restore task' : 'Archive task'}
          onClick={() => onArchive(task, !task.archived_at)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {task.archived_at ? (
            <ArchiveRestore className="h-3.5 w-3.5" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          aria-label="Delete task"
          title="Delete task"
          onClick={() => onDelete(task)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

/**
 * One status, as a card with its rows inside.
 *
 * Cards rather than a continuous list with rules through it: each status is a self-contained
 * group you scan or collapse on its own, and a bordered card says that without a separator
 * having to double as both a divider and a heading underline.
 */
function Group({
  status,
  tasks,
  onOpen,
  selected,
  onToggle,
  onArchive,
  onDelete,
}: {
  status: TaskStatus;
  tasks: TaskAcrossProjects[];
  onOpen: (task: TaskAcrossProjects) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  /** Archiving flips: an archived row is restored, not archived again. */
  onArchive: (task: TaskAcrossProjects, archived: boolean) => void;
  onDelete: (task: TaskAcrossProjects) => void;
}) {
  const [open, setOpen] = useState(true);
  if (tasks.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background shadow-sm dark:bg-muted">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-2.5 border-b border-border px-5 text-left transition-colors hover:bg-muted/50"
      >
        <StatusGlyph status={status} size={16} className="shrink-0" />
        <h3 className="text-base font-semibold leading-none tracking-tight">
          {statusLabels[status]}
        </h3>
        <span className="text-xs text-muted-foreground">({tasks.length})</span>
        <ChevronRight
          className={cn(
            'ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90'
          )}
          aria-hidden
        />
      </button>

      {open && (
        <ul className="space-y-2 p-2">
          {tasks.map((task) => (
            <Row
              key={task.id}
              task={task}
              selected={selected.has(task.id)}
              onToggle={onToggle}
              onOpen={onOpen}
              onArchive={onArchive}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

const ALL = 'all';
const GROUPING_KEY = 'kablan.allTasks.grouping';

/**
 * How the list is laid out: by status, or as one list newest first.
 *
 * Grouping answers "what is in review across everything"; the flat list answers "what did I
 * touch last", which is the question when the statuses are not what you are navigating by.
 */
type Grouping = 'status' | 'none';

function loadGrouping(): Grouping {
  try {
    return localStorage.getItem(GROUPING_KEY) === 'none' ? 'none' : 'status';
  } catch {
    return 'status';
  }
}

/** One active filter, and the way to drop it. */
function FilterChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs">
      <span className="max-w-[12rem] truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove filter ${label}`}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function AllTasks() {
  const navigate = useNavigate();
  // In the URL rather than in state: a filtered list is a view worth linking to, keeping on
  // reload, and getting back to with the browser's own back button.
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const projectFilter = params.get('project') ?? ALL;
  const statusFilter = params.get('status') ?? ALL;
  // 'active' is the resting state, so it is the one the URL leaves out.
  const [grouping, setGrouping] = useState<Grouping>(loadGrouping);
  const archiveFilter = (params.get('archive') ?? 'active') as ArchiveFilter;
  const { tasks, projectCount, isLoading } = useAllTasks(archiveFilter);
  const filtering =
    !!query ||
    projectFilter !== ALL ||
    statusFilter !== ALL ||
    archiveFilter !== 'active';

  const chooseGrouping = (next: Grouping) => {
    setGrouping(next);
    try {
      localStorage.setItem(GROUPING_KEY, next);
    } catch {
      // Blocked storage: the choice just won't persist.
    }
  };

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === ALL || (key === 'archive' && value === 'active'))
      next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  // Every project that has a task, in the order the tasks arrived — the filter should offer the
  // projects this list actually contains, not every project that exists.
  const projectOptions = useMemo(() => {
    const seen = new Map<string, { name: string; count: number }>();
    for (const task of tasks) {
      const entry = seen.get(task.projectId);
      if (entry) entry.count += 1;
      else seen.set(task.projectId, { name: task.projectName, count: 1 });
    }
    return [...seen].map(([id, value]) => ({ id, ...value }));
  }, [tasks]);

  const statusCounts = useMemo(() => {
    const counts = new Map<TaskStatus, number>();
    for (const task of tasks)
      counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
    return counts;
  }, [tasks]);

  const activeProjectName = projectOptions.find(
    (p) => p.id === projectFilter
  )?.name;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter(
      (task) =>
        (projectFilter === ALL || task.projectId === projectFilter) &&
        (statusFilter === ALL || task.status === statusFilter) &&
        (!needle || task.title.toLowerCase().includes(needle))
    );
  }, [tasks, query, projectFilter, statusFilter]);

  // Ungrouped, the order has to come from somewhere: most recently touched first, the same
  // order each group uses inside itself.
  const flat = useMemo(() => [...filtered].sort(byRecency), [filtered]);

  const grouped = useMemo(() => {
    const byStatus = new Map<TaskStatus, TaskAcrossProjects[]>();
    for (const status of STATUS_ORDER) byStatus.set(status, []);
    for (const task of filtered) byStatus.get(task.status)?.push(task);
    for (const list of byStatus.values()) list.sort(byRecency);
    return byStatus;
  }, [filtered]);

  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // Selection follows what is on screen: filtering away a selected task and then acting on it
  // would apply the action to something the person can no longer see.
  const selectedTasks = filtered.filter((task) => selected.has(task.id));

  /** Refresh the projects the acted-on tasks belong to, and the counts in the sidebar. */
  const refresh = async (projectIds: string[]) => {
    await Promise.all(
      [...new Set(projectIds)].map((id) =>
        // Prefix key: the active, archived and all listings of this project are separate
        // entries, and archiving moves a task between them.
        queryClient.invalidateQueries({ queryKey: ['tasks', 'byProject', id] })
      )
    );
    queryClient.invalidateQueries({ queryKey: ['projects', 'with-stats'] });
  };

  const bulkStatus = async (status: TaskStatus) => {
    setWorking(true);
    try {
      // Sequential rather than parallel: these are writes to one local database, and a burst of
      // them racing gains nothing over a handful of tasks.
      for (const task of selectedTasks) {
        await tasksApi.update(task.id, {
          title: null,
          description: null,
          status,
          parent_workspace_id: null,
          image_ids: null,
        });
      }
      await refresh(selectedTasks.map((t) => t.projectId));
      setSelected(new Set());
    } finally {
      setWorking(false);
    }
  };

  const bulkArchive = async (archived: boolean) => {
    setWorking(true);
    try {
      await tasksApi.setArchived(
        selectedTasks.map((t) => t.id),
        archived
      );
      await refresh(selectedTasks.map((t) => t.projectId));
      setSelected(new Set());
    } finally {
      setWorking(false);
    }
  };

  const openTask = (task: TaskAcrossProjects) => {
    // Opening the task is reading it; the project's own list picks the change up from the stream.
    if (task.has_unseen_turns) {
      tasksApi
        .markSeen(task.id)
        .then(() => {
          // The sidebar's dot is drawn from the project stats, which nothing else refreshes here.
          queryClient.invalidateQueries({
            queryKey: ['projects', 'with-stats'],
          });
        })
        .catch(() => {});
    }
    navigate(paths.task(task.projectId, task.id));
  };

  // The same two operations the bulk bar runs, aimed at one row.
  const rowArchive = async (task: TaskAcrossProjects, archived: boolean) => {
    await tasksApi.setArchived([task.id], archived);
    await refresh([task.projectId]);
  };

  const rowDelete = async (task: TaskAcrossProjects) => {
    const result = await ConfirmDialog.show({
      title: `Delete "${task.title}"?`,
      message:
        'Its attempts, worktrees and conversation go with it. This cannot be undone.',
      confirmText: 'Delete',
      variant: 'destructive',
    }).catch(() => 'canceled');
    if (result !== 'confirmed') return;

    await tasksApi.delete(task.id);
    await refresh([task.projectId]);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(task.id);
      return next;
    });
  };

  const bulkDelete = async () => {
    const count = selectedTasks.length;
    const result = await ConfirmDialog.show({
      title: `Delete ${count} ${count === 1 ? 'task' : 'tasks'}?`,
      message:
        'Their attempts, worktrees and conversations go with them. This cannot be undone.',
      confirmText: 'Delete',
      variant: 'destructive',
    }).catch(() => 'canceled');
    if (result !== 'confirmed') return;

    setWorking(true);
    try {
      for (const task of selectedTasks) await tasksApi.delete(task.id);
      await refresh(selectedTasks.map((t) => t.projectId));
      setSelected(new Set());
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="text-sm font-medium">Tasks</span>
        <span className="font-ibm-plex-mono text-[11px] tabular-nums text-muted-foreground">
          {filtering ? `${filtered.length}/${tasks.length}` : tasks.length}
        </span>
        {/* The active filters sit on the same row as the count they explain, rather than in a
          strip of their own that only exists sometimes and moves the list when it appears. */}
        {query && (
          <FilterChip label={`"${query}"`} onClear={() => setParam('q', '')} />
        )}
        {statusFilter !== ALL && (
          <FilterChip
            label={statusLabels[statusFilter as TaskStatus]}
            onClear={() => setParam('status', ALL)}
          />
        )}
        {activeProjectName && (
          <FilterChip
            label={activeProjectName}
            onClear={() => setParam('project', ALL)}
          />
        )}
        {archiveFilter !== 'active' && (
          <FilterChip
            label={archiveFilter === 'archived' ? 'Archived' : 'Incl. archived'}
            onClear={() => setParam('archive', 'active')}
          />
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {projectCount} {projectCount === 1 ? 'project' : 'projects'}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Display options"
              title="Display"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7 shrink-0',
                filtering && 'bg-accent text-foreground'
              )}
              aria-label="Filter tasks"
              title="Filter"
            >
              <ListFilter className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <div className="p-1">
              <Input
                value={query}
                onChange={(e) => setParam('q', e.target.value)}
                placeholder="Filter by title…"
                className="h-7 text-xs"
                aria-label="Filter tasks by title"
                // The menu types-ahead to jump between items; inside a text field those
                // keystrokes belong to the field.
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Status
                <span className="ml-auto mr-1 text-xs text-muted-foreground">
                  {statusFilter === ALL
                    ? 'Any'
                    : statusLabels[statusFilter as TaskStatus]}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuItem onClick={() => setParam('status', ALL)}>
                  Any status
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {STATUS_ORDER.map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => setParam('status', status)}
                  >
                    <StatusGlyph status={status} size={12} />
                    <span className="min-w-0 flex-1 truncate">
                      {statusLabels[status]}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {statusCounts.get(status) ?? 0}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Archive
                <span className="ml-auto mr-1 text-xs text-muted-foreground">
                  {archiveFilter === 'active'
                    ? 'Hidden'
                    : archiveFilter === 'archived'
                      ? 'Only'
                      : 'All'}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuItem onClick={() => setParam('archive', 'active')}>
                  Hidden
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setParam('archive', 'archived')}
                >
                  Only archived
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setParam('archive', 'all')}>
                  All
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Project
                <span className="ml-auto mr-1 max-w-[6rem] truncate text-xs text-muted-foreground">
                  {activeProjectName ?? 'Any'}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuItem onClick={() => setParam('project', ALL)}>
                  Any project
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {projectOptions.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => setParam('project', project.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {project.name}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {project.count}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* A ground behind the cards: on a page the same colour as they are, a card is just a
          border. The two tokens swap by theme — a card should read as a step towards the light
          in both, and this palette's background is its lightest surface in light mode and its
          darkest in dark. */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-background p-3">
        {isLoading ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-5"
                style={{ width: `${45 + ((i * 7) % 4) * 12}%` }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-sm font-medium">
              {filtering ? 'Nothing matches' : 'No tasks yet'}
            </p>
            <p className="max-w-xs text-sm text-muted-foreground">
              {filtering
                ? 'No task matches these filters.'
                : 'Tasks from every project show up here, grouped by status.'}
            </p>
          </div>
        ) : (
          <>
            {grouping === 'none' ? (
              // No card: its border is what separates one group from the next, and here there
              // is nothing to separate.
              <ul className="space-y-2">
                {flat.map((task) => (
                  <Row
                    key={task.id}
                    task={task}
                    selected={selected.has(task.id)}
                    onToggle={toggle}
                    onOpen={openTask}
                    onArchive={rowArchive}
                    onDelete={rowDelete}
                  />
                ))}
              </ul>
            ) : (
              STATUS_ORDER.map((status) => (
                <Group
                  key={status}
                  status={status}
                  tasks={grouped.get(status) ?? []}
                  onOpen={openTask}
                  selected={selected}
                  onToggle={toggle}
                  onArchive={rowArchive}
                  onDelete={rowDelete}
                />
              ))
            )}
          </>
        )}
      </div>

      {/* Floats over the list rather than replacing the header: the rows you are acting on stay
          where they are, the bar arrives near the cursor, and the selection can still be
          adjusted while it is open because nothing behind it moved. */}
      {selectedTasks.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-popover py-1.5 pl-3 pr-1.5 shadow-lg">
            <span className="text-xs font-medium">
              {selectedTasks.length} selected
            </span>

            {working && (
              <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}

            <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={working}
                >
                  Set status
                </Button>
              </DropdownMenuTrigger>
              {/* Upwards: the bar sits at the bottom of the pane. */}
              <DropdownMenuContent align="start" side="top" className="w-44">
                {STATUS_ORDER.map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => bulkStatus(status)}
                  >
                    <StatusGlyph status={status} size={12} />
                    {statusLabels[status]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Restoring is offered when you are looking at the archive; archiving otherwise —
                the other direction is never the one you want from where you are standing. */}
            {archiveFilter === 'archived' ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => bulkArchive(false)}
                disabled={working}
              >
                <ArchiveRestore className="mr-1 h-3.5 w-3.5" />
                Restore
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => bulkArchive(true)}
                disabled={working}
              >
                <Archive className="mr-1 h-3.5 w-3.5" />
                Archive
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={bulkDelete}
              disabled={working}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setSelected(new Set())}
              disabled={working}
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
