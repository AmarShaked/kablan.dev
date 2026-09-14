import type { LinearIdName, LinearWorkflowState } from 'shared/types';
import type { LinearStatusType } from './linear';

export const ALL_ASSIGNEES = 'all';
export const ASSIGNED_TO_ME = 'me';
export const UNASSIGNED = 'unassigned';

export type LinearAssigneeFilter =
  | typeof ALL_ASSIGNEES
  | typeof ASSIGNED_TO_ME
  | typeof UNASSIGNED
  | string;

export type LinearFilters = {
  /** `'all'` or a Linear workflow state **name** (shared across teams) */
  status: string;
  assignee: LinearAssigneeFilter;
  /** `'all'` or a Linear team id */
  team: string;
  /** Free-text search; empty string means no search */
  q: string;
};

export const DEFAULT_LINEAR_FILTERS: LinearFilters = {
  status: 'all',
  assignee: ASSIGNED_TO_ME,
  team: 'all',
  q: '',
};

export const LINEAR_STATUS_TYPE_ORDER: LinearStatusType[] = [
  'triage',
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled',
];

export const LINEAR_STATUS_TYPE_LABEL: Record<LinearStatusType, string> = {
  triage: 'Triage',
  backlog: 'Backlog',
  unstarted: 'Unstarted',
  started: 'Started',
  completed: 'Completed',
  canceled: 'Canceled',
};

export function linearFiltersActive(filters: LinearFilters): boolean {
  return (
    filters.status !== DEFAULT_LINEAR_FILTERS.status ||
    filters.assignee !== DEFAULT_LINEAR_FILTERS.assignee ||
    filters.team !== DEFAULT_LINEAR_FILTERS.team ||
    filters.q.trim() !== ''
  );
}

export function linearIssuesQueryParams(filters: LinearFilters): {
  status?: string;
  assignee?: string;
  team?: string;
  q?: string;
} {
  const q = filters.q.trim();
  return {
    status: filters.status === 'all' ? undefined : filters.status,
    assignee: filters.assignee,
    team: filters.team === 'all' ? undefined : filters.team,
    q: q || undefined,
  };
}

export function assigneeFilterLabel(
  filter: LinearAssigneeFilter,
  users: LinearIdName[] = []
): string {
  if (filter === ASSIGNED_TO_ME) return 'Assigned to you';
  if (filter === ALL_ASSIGNEES) return 'Anyone';
  if (filter === UNASSIGNED) return 'Unassigned';
  return users.find((user) => user.id === filter)?.name ?? filter;
}

export function statusFilterLabel(statusName: string): string {
  if (statusName === 'all') return 'Any status';
  return statusName;
}

export function teamFilterLabel(
  teamId: string,
  teams: LinearIdName[] = []
): string {
  if (teamId === 'all') return 'Any team';
  return teams.find((team) => team.id === teamId)?.name ?? teamId;
}

/**
 * Linear returns one workflow state per team, so the same label (e.g. Triage)
 * appears many times. Deduplicate by name for the filter menu. When a team is
 * selected, only that team's states are considered.
 */
export function uniqueStatusesForFilter(
  states: LinearWorkflowState[],
  teamId: string = 'all'
): LinearWorkflowState[] {
  const scoped =
    teamId === 'all'
      ? states
      : states.filter((state) => state.team_id === teamId);

  const seen = new Set<string>();
  const unique: LinearWorkflowState[] = [];
  for (const state of scoped) {
    const key = state.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(state);
  }
  return unique;
}

export function groupStatesByType(
  states: LinearWorkflowState[]
): { type: LinearStatusType; label: string; states: LinearWorkflowState[] }[] {
  const byType = new Map<LinearStatusType, LinearWorkflowState[]>();
  for (const state of states) {
    const type = (LINEAR_STATUS_TYPE_ORDER.includes(
      state.type_name as LinearStatusType
    )
      ? state.type_name
      : 'unstarted') as LinearStatusType;
    const list = byType.get(type) ?? [];
    list.push(state);
    byType.set(type, list);
  }

  return LINEAR_STATUS_TYPE_ORDER.flatMap((type) => {
    const group = byType.get(type);
    if (!group?.length) return [];
    const sorted = [...group].sort((a, b) => a.name.localeCompare(b.name));
    return [{ type, label: LINEAR_STATUS_TYPE_LABEL[type], states: sorted }];
  });
}

export function otherUsers(
  users: LinearIdName[],
  viewerId: string | null
): LinearIdName[] {
  return users
    .filter((user) => user.id !== viewerId)
    .sort((a, b) => a.name.localeCompare(b.name));
}
