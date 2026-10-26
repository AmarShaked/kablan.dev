import { describe, expect, it } from 'vitest';

import { globalRail } from './RightRail';

describe('globalRail', () => {
  it('covers tasks, archive, and the projects list', () => {
    expect(globalRail('/tasks', '')).toBe('tasks');
    expect(globalRail('/tasks', '?archive=archived')).toBe('archive');
    expect(globalRail('/local-projects', '')).toBe('projects');
    expect(globalRail('/', '')).toBe('projects');
  });

  it('leaves project pages and the rest of the app alone', () => {
    expect(globalRail('/local-projects/sweet/tasks', '')).toBeNull();
    expect(globalRail('/settings/general', '')).toBeNull();
  });
});
