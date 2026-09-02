import { ArrowUpDown, Check, ListFilter, X } from 'lucide-react';

import type { ArchiveFilter, TaskStatus } from 'shared/types';
import { STATUS_ORDER, statusLabels } from '@/utils/statusLabels';
import { StatusGlyph } from '@/components/tasks/TaskStatusControl';
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
import { cn } from '@/lib/utils';

export const ALL_STATUSES = 'all';
/** In Progress and In Review together: the work that is actually in flight. */
export const ACTIVE_STATUSES = 'active';

export type StatusFilter =
  | TaskStatus
  | typeof ALL_STATUSES
  | typeof ACTIVE_STATUSES;

export type TaskSort = 'updated' | 'created' | 'title';

export type TaskFilters = {
  /** A status, `active` for the two in-flight ones, or `all`. */
  status: StatusFilter;
  archive: ArchiveFilter;
};

export function matchesStatusFilter(
  status: TaskStatus,
  filter: StatusFilter
): boolean {
  if (filter === ALL_STATUSES) return true;
  if (filter === ACTIVE_STATUSES)
    return status === 'inprogress' || status === 'inreview';
  return status === filter;
}

const SORT_LABELS: Record<TaskSort, string> = {
  updated: 'Last updated',
  created: 'Newest first',
  title: 'Title, A–Z',
};

/** One ordering, used by both layouts so a group and the flat list never disagree. */
export function compareTasks<
  T extends { title: string; created_at: string; updated_at: string },
>(sort: TaskSort) {
  return (a: T, b: T) => {
    switch (sort) {
      case 'title':
        return a.title.localeCompare(b.title);
      case 'created':
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      default:
        return (
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
    }
  };
}

export const NO_FILTERS: TaskFilters = {
  status: ALL_STATUSES,
  archive: 'active',
};

export function filtersActive(f: TaskFilters): boolean {
  return f.status !== ALL_STATUSES || f.archive !== 'active';
}

const ARCHIVE_LABELS: Record<ArchiveFilter, string> = {
  active: 'Hidden',
  archived: 'Archived only',
  all: 'Include archived',
};

/**
 * The filters a single project's list can take, in the shape the cross-project list uses: one
 * line per dimension with its current value, and the values a level down.
 *
 * "Active" sits at the top level rather than inside Status because it is not a status — it is
 * the question you ask most ("what is actually in flight?"), and burying it a level down would
 * cost two clicks every time.
 */
export function TaskFilterMenu({
  value,
  onChange,
  counts,
}: {
  value: TaskFilters;
  onChange: (next: TaskFilters) => void;
  /** How many tasks each status holds right now, for the submenu. */
  counts: Record<TaskStatus, number>;
}) {
  const statusValue =
    value.status === ALL_STATUSES
      ? 'Any'
      : value.status === ACTIVE_STATUSES
        ? 'Active'
        : statusLabels[value.status];

  const activeCount = counts.inprogress + counts.inreview;
  const on = value.status === ACTIVE_STATUSES;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Filter tasks"
          title="Filter"
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            'data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground',
            filtersActive(value) && 'bg-accent text-foreground'
          )}
        >
          <ListFilter className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        {/* A plain item rather than a checkbox one: the checkbox variant indents for its tick,
            which left this line hanging inwards from the two below it. */}
        <DropdownMenuItem
          onClick={() =>
            onChange({
              ...value,
              status: on ? ALL_STATUSES : ACTIVE_STATUSES,
            })
          }
        >
          <span className="min-w-0 flex-1 truncate">Active only</span>
          {on && <Check className="h-3.5 w-3.5 shrink-0" />}
          <span className="text-xs tabular-nums text-muted-foreground">
            {activeCount}
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Status
            <span className="ml-auto mr-1 text-xs text-muted-foreground">
              {statusValue}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem
              onClick={() => onChange({ ...value, status: ALL_STATUSES })}
            >
              Any status
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {STATUS_ORDER.map((status) => (
              <DropdownMenuItem
                key={status}
                onClick={() => onChange({ ...value, status })}
              >
                <StatusGlyph status={status} size={12} />
                <span className="min-w-0 flex-1 truncate">
                  {statusLabels[status]}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {counts[status]}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Archive
            <span className="ml-auto mr-1 text-xs text-muted-foreground">
              {value.archive === 'active'
                ? 'Hidden'
                : value.archive === 'archived'
                  ? 'Only'
                  : 'All'}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            {(['active', 'all', 'archived'] as ArchiveFilter[]).map((key) => (
              <DropdownMenuItem
                key={key}
                onClick={() => onChange({ ...value, archive: key })}
              >
                {ARCHIVE_LABELS[key]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One active filter, and the way to drop it. Same chip the cross-project list uses. */
export function FilterChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-1.5 text-[11px]">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label} filter`}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/** The chips for whatever is on, or nothing when the list is unfiltered. */
export function TaskFilterChips({
  value,
  onChange,
}: {
  value: TaskFilters;
  onChange: (next: TaskFilters) => void;
}) {
  if (!filtersActive(value)) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
      {value.status !== ALL_STATUSES && (
        <FilterChip
          label={
            value.status === ACTIVE_STATUSES
              ? 'Active'
              : statusLabels[value.status]
          }
          onClear={() => onChange({ ...value, status: ALL_STATUSES })}
        />
      )}
      {value.archive !== 'active' && (
        <FilterChip
          label={ARCHIVE_LABELS[value.archive]}
          onClear={() => onChange({ ...value, archive: 'active' })}
        />
      )}
    </div>
  );
}

/**
 * How the list is ordered.
 *
 * Separate from the filter because they answer different questions — which tasks, and in what
 * order — and because you change them at different moments.
 */
export function TaskSortMenu({
  value,
  onChange,
}: {
  value: TaskSort;
  onChange: (next: TaskSort) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Sort tasks"
          title="Sort"
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            'data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground',
            value !== 'updated' && 'bg-accent text-foreground'
          )}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Sort by
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as TaskSort)}
        >
          {(Object.keys(SORT_LABELS) as TaskSort[]).map((key) => (
            <DropdownMenuRadioItem key={key} value={key} className="text-sm">
              {SORT_LABELS[key]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
