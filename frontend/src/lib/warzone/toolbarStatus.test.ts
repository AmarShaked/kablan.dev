import { describe, expect, it } from 'vitest';

import {
  applyWarzoneTaskParam,
  resolveWarzoneFocusTaskId,
  shouldDropReservedForProjectFilter,
  warzoneToolbarStatusParts,
} from './toolbarStatus';
import { assignStableSlots, resolveWarzoneSlotAction } from './slots';

describe('warzoneToolbarStatusParts', () => {
  it('omits both segments when counts are zero', () => {
    expect(
      warzoneToolbarStatusParts({ needsYouCount: 0, overflow: 0 })
    ).toEqual([]);
  });

  it('includes needsYou and overflow segments when positive', () => {
    expect(
      warzoneToolbarStatusParts({ needsYouCount: 3, overflow: 2 })
    ).toEqual([
      { key: 'needsYou', count: 3 },
      { key: 'moreNotShown', count: 2 },
    ]);
  });
});

describe('applyWarzoneTaskParam', () => {
  it('sets task and preserves other params', () => {
    const prev = new URLSearchParams('project=p1&task=old');
    const next = applyWarzoneTaskParam(prev, 'new-id');
    expect(next.get('task')).toBe('new-id');
    expect(next.get('project')).toBe('p1');
  });

  it('clears task on Esc-style null', () => {
    const prev = new URLSearchParams('task=abc&project=p1');
    const next = applyWarzoneTaskParam(prev, null);
    expect(next.get('task')).toBeNull();
    expect(next.get('project')).toBe('p1');
  });
});

describe('resolveWarzoneFocusTaskId', () => {
  it('keeps focus when still eligible', () => {
    expect(
      resolveWarzoneFocusTaskId({
        focusedTaskId: 'b',
        eligibleIds: ['a', 'b', 'c'],
      })
    ).toBe('b');
  });

  it('replaces with needs-you when focus left eligibility', () => {
    expect(
      resolveWarzoneFocusTaskId({
        focusedTaskId: 'gone',
        eligibleIds: ['a', 'b'],
        needsYouIds: ['b'],
      })
    ).toBe('b');
  });

  it('falls back to first eligible, then null', () => {
    expect(
      resolveWarzoneFocusTaskId({
        focusedTaskId: 'gone',
        eligibleIds: ['a', 'b'],
      })
    ).toBe('a');
    expect(
      resolveWarzoneFocusTaskId({
        focusedTaskId: 'gone',
        eligibleIds: [],
      })
    ).toBeNull();
  });
});

describe('shouldDropReservedForProjectFilter', () => {
  it('keeps reserved when filter is all projects', () => {
    expect(
      shouldDropReservedForProjectFilter({
        reserved: { slot: 1, taskId: 't1' },
        projectFilter: null,
        taskProjectId: 'p-a',
      })
    ).toBe(false);
  });

  it('drops reserved when task is outside filtered project', () => {
    expect(
      shouldDropReservedForProjectFilter({
        reserved: { slot: 1, taskId: 't1' },
        projectFilter: 'p-b',
        taskProjectId: 'p-a',
      })
    ).toBe(true);
  });

  it('drops reserved when task project is unknown under a filter', () => {
    expect(
      shouldDropReservedForProjectFilter({
        reserved: { slot: 1, taskId: 't1' },
        projectFilter: 'p-b',
        taskProjectId: undefined,
      })
    ).toBe(true);
  });
});

describe('assignStableSlots + URL select behaviour', () => {
  it('maps assigned slot click to select action for URL focus', () => {
    const { assignment } = assignStableSlots({
      eligibleIds: ['a', 'b', 'c'],
      previous: new Map(),
    });
    const slot = 2;
    const taskId = assignment.get(slot);
    expect(taskId).toBeDefined();

    const action = resolveWarzoneSlotAction({
      slot,
      assignedTaskId: taskId,
      taskInList: true,
    });
    expect(action).toEqual({ type: 'select', taskId });

    const params = applyWarzoneTaskParam(new URLSearchParams(), taskId!);
    expect(params.get('task')).toBe(taskId);
  });
});
