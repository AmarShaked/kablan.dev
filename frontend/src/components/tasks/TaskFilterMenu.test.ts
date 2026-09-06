import { describe, expect, it } from 'vitest';

import type { TaskStatus } from 'shared/types';
import {
  ACTIVE_STATUSES,
  ALL_STATUSES,
  matchesStatusFilter,
} from './TaskFilterMenu';

describe('matchesStatusFilter', () => {
  it('shows every status under "any"', () => {
    const statuses: TaskStatus[] = [
      'todo',
      'inprogress',
      'inreview',
      'done',
      'cancelled',
    ];
    for (const status of statuses) {
      expect(matchesStatusFilter(status, ALL_STATUSES)).toBe(true);
    }
  });

  it('matches only the status asked for', () => {
    expect(matchesStatusFilter('todo', 'todo')).toBe(true);
    expect(matchesStatusFilter('todo', 'done')).toBe(false);
  });

  describe('"active"', () => {
    // The project list opens on this filter, so a task is invisible in its own project until
    // "active" admits it. A task is created as `todo`, which is why this case is load-bearing.
    it('includes a freshly created task', () => {
      expect(matchesStatusFilter('todo', ACTIVE_STATUSES)).toBe(true);
    });

    it('includes work in flight', () => {
      expect(matchesStatusFilter('inprogress', ACTIVE_STATUSES)).toBe(true);
      expect(matchesStatusFilter('inreview', ACTIVE_STATUSES)).toBe(true);
    });

    it('excludes the history that would push live work off the screen', () => {
      expect(matchesStatusFilter('done', ACTIVE_STATUSES)).toBe(false);
      expect(matchesStatusFilter('cancelled', ACTIVE_STATUSES)).toBe(false);
    });
  });
});
