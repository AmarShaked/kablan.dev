import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { invalidateTaskViews } from './taskCache';

/**
 * These pin the keys, because the bug they come from was a key that nobody invalidated: the
 * project board corrected itself from its stream while the archived listing and the sidebar
 * counts went on showing a task where it no longer was, until the page was reloaded.
 */

/** Records what was invalidated without needing queries to exist. */
function spyClient() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  return {
    client,
    keys: () => invalidate.mock.calls.map((c) => c[0]?.queryKey),
  };
}

describe('invalidateTaskViews', () => {
  it("refreshes each named project's listings and the project stats", () => {
    const { client, keys } = spyClient();

    invalidateTaskViews(client, ['p1', 'p2']);

    expect(keys()).toEqual([
      ['tasks', 'byProject', 'p1'],
      ['tasks', 'byProject', 'p2'],
      ['projects', 'with-stats'],
    ]);
  });

  it('uses a prefix key, so active, archived and all listings all go at once', () => {
    const { client, keys } = spyClient();

    invalidateTaskViews(client, ['p1']);

    // Not ['tasks', 'byProject', 'p1', 'active'] — archiving is a move between those listings,
    // and refreshing only the one you are looking at is what left the other stale.
    expect(keys()[0]).toEqual(['tasks', 'byProject', 'p1']);
  });

  it('refreshes every project when told none', () => {
    const { client, keys } = spyClient();

    invalidateTaskViews(client);

    expect(keys()).toEqual([['tasks'], ['projects', 'with-stats']]);
  });

  it('asks once per project, however many times it is named', () => {
    const { client, keys } = spyClient();

    invalidateTaskViews(client, ['p1', 'p1', 'p2', 'p1']);

    expect(keys()).toEqual([
      ['tasks', 'byProject', 'p1'],
      ['tasks', 'byProject', 'p2'],
      ['projects', 'with-stats'],
    ]);
  });

  it('always refreshes the stats, which no task write touches on its own', () => {
    const { client, keys } = spyClient();

    invalidateTaskViews(client, []);

    expect(keys()).toContainEqual(['projects', 'with-stats']);
  });

  it('actually marks a matching query stale, not just a key that looks right', async () => {
    const client = new QueryClient();
    // The two entries a project board and its archive view hold.
    client.setQueryData(['tasks', 'byProject', 'p1', 'active'], []);
    client.setQueryData(['tasks', 'byProject', 'p1', 'archived'], []);
    client.setQueryData(['projects', 'with-stats'], []);

    invalidateTaskViews(client, ['p1']);

    const stale = client
      .getQueryCache()
      .getAll()
      .filter((q) => q.isStale())
      .map((q) => q.queryKey);
    expect(stale).toHaveLength(3);
  });
});
