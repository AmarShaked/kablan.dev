import type { QueryKey } from '@tanstack/react-query';
import type { Operation } from 'rfc6902';

import { projectKeys, repoKeys, taskKeys } from './queryKeys';

/**
 * Which caches a batch of server changes makes stale.
 *
 * The server's change stream forwards the patches its own views use, untouched; the path says
 * what kind of record moved. This turns those into query keys to invalidate — one decision per
 * record kind, so "a task changed" always means the same set of views goes and asks again.
 *
 * Pure, so it is testable without a socket: operations in, keys out.
 */
export function invalidationsFor(ops: readonly Operation[]): QueryKey[] {
  const keys = new Map<string, QueryKey>();
  const add = (key: QueryKey) => keys.set(JSON.stringify(key), key);

  for (const op of ops) {
    const path = op.path;

    if (path === '/resync') {
      // The stream fell behind and cannot say what was missed: everything it covers goes.
      add(taskKeys.all);
      add(projectKeys.all);
      add(repoKeys.all);
      continue;
    }

    if (path.startsWith('/tasks/')) {
      // A task moved. Its project's listings, and the counts drawn from them.
      const projectId = projectIdOf(op);
      add(projectId ? taskKeys.byProject(projectId) : taskKeys.all);
      add(projectKeys.withStats);
    } else if (path.startsWith('/projects/')) {
      add(projectKeys.all);
      // Repositories hang off projects: a project deleted takes its list with it.
      add(repoKeys.all);
    } else if (path.startsWith('/workspaces/')) {
      // An attempt ran, finished or was archived: what a task row says about itself changed.
      add(taskKeys.all);
      add(projectKeys.withStats);
    }
  }

  return [...keys.values()];
}

/** The project a task patch belongs to, when the operation carries the task. */
function projectIdOf(op: Operation): string | undefined {
  if (op.op !== 'add' && op.op !== 'replace') return undefined;
  const value = op.value as { project_id?: unknown } | undefined;
  return typeof value?.project_id === 'string' ? value.project_id : undefined;
}
