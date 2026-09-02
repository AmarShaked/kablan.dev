/**
 * Every React Query key for projects, tasks and repositories, in one place.
 *
 * The bugs this replaces were all the same bug: the same data cached under several keys written
 * by hand in several files, and a write that updated the one nearest to hand. A saved icon
 * reached `['projects']` but not `['projects', 'with-stats']`, which is what the sidebar reads;
 * a saved dev script reached `['repos']` but not the query that decides whether the run button is
 * enabled. Nothing was wrong at any one site. The keys just did not know about each other.
 *
 * So they are defined once, and shaped so that invalidating a family's `all` reaches every member
 * by prefix: `['projects']` covers `['projects', 'with-stats']` and `['projects', 'detail', id]`.
 * A new query for one of these families gets its key from here, or it will be the next stale one.
 */

export const projectKeys = {
  all: ['projects'] as const,
  /** The list with per-project counts and unread dots: the sidebar and the projects page. */
  withStats: ['projects', 'with-stats'] as const,
  detail: (projectId: string) => ['projects', 'detail', projectId] as const,
};

export const taskKeys = {
  all: ['tasks'] as const,
  byId: (taskId: string | undefined) => ['tasks', 'detail', taskId] as const,
  /** Prefix for one project's listings; the filtered form adds which one. */
  byProject: (projectId: string) => ['tasks', 'byProject', projectId] as const,
  byProjectFiltered: (projectId: string, archived: string) =>
    ['tasks', 'byProject', projectId, archived] as const,
};

export const repoKeys = {
  all: ['repos'] as const,
  byProject: (projectId: string | undefined) =>
    ['repos', 'byProject', projectId] as const,
  /**
   * Whether a project has any repository with a dev server script. Under the repos prefix
   * because that is what changes it: saving a script, adding or removing a repository.
   */
  hasDevServerScript: (projectId: string | undefined) =>
    ['repos', 'hasDevServerScript', projectId] as const,
};
