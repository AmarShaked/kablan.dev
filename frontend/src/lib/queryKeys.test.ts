import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { projectKeys, repoKeys, taskKeys } from './queryKeys';

/**
 * The factory's one promise: invalidating a family's `all` reaches every member. These hold the
 * shapes to that, with a real QueryClient rather than by comparing arrays — prefix matching is
 * React Query's rule, and the test should fail if a key is ever moved out from under it.
 */
function staleAfter(
  invalidate: readonly unknown[],
  keys: readonly (readonly unknown[])[]
) {
  const client = new QueryClient();
  for (const key of keys) client.setQueryData(key, {});
  client.invalidateQueries({ queryKey: invalidate });
  return client
    .getQueryCache()
    .getAll()
    .filter((q) => q.isStale())
    .map((q) => q.queryKey);
}

describe('queryKeys', () => {
  it('projectKeys.all reaches the stats list and a detail entry', () => {
    const members = [projectKeys.withStats, projectKeys.detail('p1')];
    expect(staleAfter(projectKeys.all, members)).toHaveLength(members.length);
  });

  it("taskKeys.byProject reaches that project's filtered listings and no other's", () => {
    const stale = staleAfter(taskKeys.byProject('p1'), [
      taskKeys.byProjectFiltered('p1', 'active'),
      taskKeys.byProjectFiltered('p1', 'archived'),
      taskKeys.byProjectFiltered('p2', 'active'),
    ]);
    expect(stale).toEqual([
      taskKeys.byProjectFiltered('p1', 'active'),
      taskKeys.byProjectFiltered('p1', 'archived'),
    ]);
  });

  it('repoKeys.all reaches the per-project lists and the dev-script answer', () => {
    // The dev-script key used to live at ['hasDevServerScript', id], outside the family, which
    // is exactly why saving a script never refreshed it.
    const members = [
      repoKeys.byProject('p1'),
      repoKeys.hasDevServerScript('p1'),
    ];
    expect(staleAfter(repoKeys.all, members)).toHaveLength(members.length);
  });

  it('taskKeys.all reaches detail entries too', () => {
    expect(staleAfter(taskKeys.all, [taskKeys.byId('t1')])).toHaveLength(1);
  });
});
