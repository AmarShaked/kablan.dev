import { beforeEach, describe, expect, it } from 'vitest';
import {
  arrangeIntegrations,
  arrangeProjects,
  readSidebarSectionPrefs,
  writeSidebarSectionPrefs,
} from './sidebarSection';

const projects = [
  {
    name: 'zeta',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-03-01T00:00:00.000Z',
    has_unseen_turns: false,
    running_count: 0,
  },
  {
    name: 'Alpha',
    created_at: '2024-06-01T00:00:00.000Z',
    updated_at: '2024-06-01T00:00:00.000Z',
    has_unseen_turns: true,
    running_count: 0,
  },
  {
    name: 'middle',
    created_at: '2024-02-01T00:00:00.000Z',
    updated_at: '2024-02-01T00:00:00.000Z',
    has_unseen_turns: false,
    running_count: 2,
  },
];

describe('arrangeProjects', () => {
  it('sorts by name without caring about case', () => {
    expect(
      arrangeProjects(projects, 'az', 'all').map((project) => project.name)
    ).toEqual(['Alpha', 'middle', 'zeta']);
  });

  it('puts the most recently updated project first', () => {
    expect(
      arrangeProjects(projects, 'recency', 'all').map((project) => project.name)
    ).toEqual(['Alpha', 'zeta', 'middle']);
  });

  it('treats a new task or chat as more recent than the project row', () => {
    const worked = projects.map((project) =>
      project.name === 'middle'
        ? { ...project, last_activity_at: '2024-12-01T00:00:00.000Z' }
        : project
    );
    expect(
      arrangeProjects(worked, 'recency', 'all').map((project) => project.name)
    ).toEqual(['middle', 'Alpha', 'zeta']);
  });

  it('ranks unread ahead of a running agent, then everything else', () => {
    expect(
      arrangeProjects(projects, 'priority', 'all').map(
        (project) => project.name
      )
    ).toEqual(['Alpha', 'middle', 'zeta']);
  });

  it('keeps only projects with something unread', () => {
    expect(
      arrangeProjects(projects, 'az', 'unreads').map((project) => project.name)
    ).toEqual(['Alpha']);
  });
});

describe('arrangeIntegrations', () => {
  const integrations = [
    { name: 'Linear', connected: true, order: 0 },
    { name: 'Jira', connected: false, order: 1 },
    { name: 'GitHub Issues', connected: true, order: 2 },
  ];

  it('keeps the saved order for recency', () => {
    expect(
      arrangeIntegrations(integrations, 'recency', 'all').map(
        (item) => item.name
      )
    ).toEqual(['Linear', 'Jira', 'GitHub Issues']);
  });

  it('sorts by name', () => {
    expect(
      arrangeIntegrations(integrations, 'az', 'all').map((item) => item.name)
    ).toEqual(['GitHub Issues', 'Jira', 'Linear']);
  });

  it('puts connected integrations first without reshuffling the rest', () => {
    expect(
      arrangeIntegrations(integrations, 'priority', 'all').map(
        (item) => item.name
      )
    ).toEqual(['Linear', 'GitHub Issues', 'Jira']);
  });

  it('drops integrations that are not connected', () => {
    expect(
      arrangeIntegrations(integrations, 'recency', 'connected').map(
        (item) => item.name
      )
    ).toEqual(['Linear', 'GitHub Issues']);
  });
});

describe('sidebar section prefs', () => {
  const key = 'kablan.sidebar.test';

  beforeEach(() => {
    localStorage.removeItem(key);
  });

  it('starts at recency with nothing filtered', () => {
    expect(readSidebarSectionPrefs(key, ['unreads', 'all'])).toEqual({
      sort: 'recency',
      filter: 'all',
    });
  });

  it('round-trips a choice and ignores a filter this section does not offer', () => {
    writeSidebarSectionPrefs(key, { sort: 'az', filter: 'connected' });
    expect(readSidebarSectionPrefs(key, ['unreads', 'all'])).toEqual({
      sort: 'az',
      filter: 'all',
    });
    expect(readSidebarSectionPrefs(key, ['connected', 'all'])).toEqual({
      sort: 'az',
      filter: 'connected',
    });
  });

  it('ignores a stored value it does not understand', () => {
    localStorage.setItem(key, '{');
    expect(readSidebarSectionPrefs(key, ['all'])).toEqual({
      sort: 'recency',
      filter: 'all',
    });
    localStorage.setItem(key, JSON.stringify({ sort: 'nope', filter: 'all' }));
    expect(readSidebarSectionPrefs(key, ['all']).sort).toBe('recency');
  });
});
