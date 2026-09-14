import { describe, expect, it } from 'vitest';
import type { LinearIdName, LinearWorkflowState } from 'shared/types';
import {
  DEFAULT_LINEAR_FILTERS,
  assigneeFilterLabel,
  groupStatesByType,
  linearFiltersActive,
  linearIssuesQueryParams,
  otherUsers,
  statusFilterLabel,
  teamFilterLabel,
  uniqueStatusesForFilter,
} from './linearFilters';

const states: LinearWorkflowState[] = [
  {
    id: 's-todo',
    name: 'Todo',
    type_name: 'unstarted',
    color: '#e2e2e2',
    team_id: 't1',
  },
  {
    id: 's-progress',
    name: 'In Progress',
    type_name: 'started',
    color: '#f2c94c',
    team_id: 't1',
  },
  {
    id: 's-done',
    name: 'Done',
    type_name: 'completed',
    color: '#5e6ad2',
    team_id: 't1',
  },
];

const teams: LinearIdName[] = [
  { id: 't1', name: 'Engineering' },
  { id: 't2', name: 'Platform' },
];

const users: LinearIdName[] = [
  { id: 'u-me', name: 'You' },
  { id: 'u-maya', name: 'Maya Chen' },
];

describe('linearIssuesQueryParams', () => {
  it('omits all/default status and team, keeps assignee', () => {
    expect(linearIssuesQueryParams(DEFAULT_LINEAR_FILTERS)).toEqual({
      status: undefined,
      assignee: 'me',
      team: undefined,
      q: undefined,
    });
  });

  it('passes names/ids when narrowed', () => {
    expect(
      linearIssuesQueryParams({
        status: 'Done',
        assignee: 'u-maya',
        team: 't2',
        q: 'login',
      })
    ).toEqual({
      status: 'Done',
      assignee: 'u-maya',
      team: 't2',
      q: 'login',
    });
  });
});

describe('linearFiltersActive', () => {
  it('is off on defaults', () => {
    expect(linearFiltersActive(DEFAULT_LINEAR_FILTERS)).toBe(false);
  });

  it('is on when any filter differs', () => {
    expect(
      linearFiltersActive({ ...DEFAULT_LINEAR_FILTERS, status: 'Todo' })
    ).toBe(true);
    expect(
      linearFiltersActive({ ...DEFAULT_LINEAR_FILTERS, assignee: 'all' })
    ).toBe(true);
    expect(
      linearFiltersActive({ ...DEFAULT_LINEAR_FILTERS, team: 't1' })
    ).toBe(true);
    expect(
      linearFiltersActive({ ...DEFAULT_LINEAR_FILTERS, q: 'sso' })
    ).toBe(true);
  });
});

describe('labels', () => {
  it('resolves chip labels from meta catalogs', () => {
    expect(statusFilterLabel('Done')).toBe('Done');
    expect(teamFilterLabel('t2', teams)).toBe('Platform');
    expect(assigneeFilterLabel('u-maya', users)).toBe('Maya Chen');
    expect(assigneeFilterLabel('me')).toBe('Assigned to you');
  });
});

describe('uniqueStatusesForFilter', () => {
  const multiTeam: LinearWorkflowState[] = [
    {
      id: 's-triage-1',
      name: 'Triage',
      type_name: 'triage',
      color: '#f2994a',
      team_id: 't1',
    },
    {
      id: 's-triage-2',
      name: 'Triage',
      type_name: 'triage',
      color: '#f2994a',
      team_id: 't2',
    },
    {
      id: 's-todo-1',
      name: 'Todo',
      type_name: 'unstarted',
      color: '#e2e2e2',
      team_id: 't1',
    },
    {
      id: 's-todo-2',
      name: 'Todo',
      type_name: 'unstarted',
      color: '#e2e2e2',
      team_id: 't2',
    },
  ];

  it('dedupes the same status name across teams', () => {
    const unique = uniqueStatusesForFilter(multiTeam);
    expect(unique.map((s) => s.name)).toEqual(['Triage', 'Todo']);
  });

  it('scopes to one team when selected', () => {
    const unique = uniqueStatusesForFilter(multiTeam, 't2');
    expect(unique.map((s) => s.id)).toEqual(['s-triage-2', 's-todo-2']);
  });
});

describe('groupStatesByType', () => {
  it('groups and orders by Linear workflow type', () => {
    const groups = groupStatesByType(states);
    expect(groups.map((g) => g.type)).toEqual([
      'unstarted',
      'started',
      'completed',
    ]);
    expect(groups[0].states[0].name).toBe('Todo');
  });
});

describe('otherUsers', () => {
  it('excludes the viewer', () => {
    expect(otherUsers(users, 'u-me').map((u) => u.id)).toEqual(['u-maya']);
  });
});
