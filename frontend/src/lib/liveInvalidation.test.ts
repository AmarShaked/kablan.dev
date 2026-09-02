import { describe, expect, it } from 'vitest';
import type { Operation } from 'rfc6902';

import { invalidationsFor } from './liveInvalidation';
import { projectKeys, repoKeys, taskKeys } from './queryKeys';

/**
 * The stream forwards the server's own patches; these pin what each kind makes stale. A kind
 * that maps to nothing here is a view that stays wrong until reload — the bug this replaces.
 */

const taskOp = (
  project_id: string,
  op: 'add' | 'replace' = 'replace'
): Operation =>
  ({ op, path: '/tasks/t1', value: { id: 't1', project_id } }) as Operation;

describe('invalidationsFor', () => {
  it("a task change refreshes its project's listings and the counts", () => {
    expect(invalidationsFor([taskOp('p1')])).toEqual([
      taskKeys.byProject('p1'),
      projectKeys.withStats,
    ]);
  });

  it('a task removal, which carries no body, refreshes every listing', () => {
    // `remove` has no value, so the project is unknown; asking every project again is cheaper
    // than leaving one of them showing a task that is gone.
    const remove: Operation = { op: 'remove', path: '/tasks/t1' };
    expect(invalidationsFor([remove])).toEqual([
      taskKeys.all,
      projectKeys.withStats,
    ]);
  });

  it('a project change refreshes projects and their repositories', () => {
    const op = { op: 'replace', path: '/projects/p1', value: {} } as Operation;
    expect(invalidationsFor([op])).toEqual([projectKeys.all, repoKeys.all]);
  });

  it('a workspace change refreshes what task rows say about themselves', () => {
    const op = {
      op: 'replace',
      path: '/workspaces/w1',
      value: {},
    } as Operation;
    expect(invalidationsFor([op])).toEqual([
      taskKeys.all,
      projectKeys.withStats,
    ]);
  });

  it('a resync notice refreshes everything the stream covers', () => {
    const op = { op: 'replace', path: '/resync', value: true } as Operation;
    expect(invalidationsFor([op])).toEqual([
      taskKeys.all,
      projectKeys.all,
      repoKeys.all,
    ]);
  });

  it('a burst asks for each key once', () => {
    const ops = [taskOp('p1'), taskOp('p1', 'add'), taskOp('p2'), taskOp('p1')];
    expect(invalidationsFor(ops)).toEqual([
      taskKeys.byProject('p1'),
      projectKeys.withStats,
      taskKeys.byProject('p2'),
    ]);
  });

  it('ignores paths it does not know, rather than refreshing blindly', () => {
    const op = {
      op: 'add',
      path: '/execution_processes/e1',
      value: {},
    } as Operation;
    expect(invalidationsFor([op])).toEqual([]);
  });
});
