import { describe, expect, it } from 'vitest';
import {
  WARZONE_SLOT_COUNT,
  assignStableSlots,
  resolveWarzoneSlotAction,
  shouldClearReserved,
  warzoneSlotCells,
} from './slots';

describe('warzoneSlotCells', () => {
  it('returns 16 entries with expected anchor slots for ring layout', () => {
    const cells = warzoneSlotCells(16);
    expect(cells).toHaveLength(WARZONE_SLOT_COUNT);
    expect(cells.find((c) => c.slot === 1)).toEqual({
      slot: 1,
      row: 1,
      col: 1,
    });
    expect(cells.find((c) => c.slot === 9)).toEqual({
      slot: 9,
      row: 5,
      col: 5,
    });
    expect(cells.find((c) => c.slot === 13)).toEqual({
      slot: 13,
      row: 5,
      col: 1,
    });
  });

  it('places no ring slot in centre rows 2–4 and cols 2–4', () => {
    for (const { row, col } of warzoneSlotCells(16)) {
      const inCentre = row >= 2 && row <= 4 && col >= 2 && col <= 4;
      expect(inCentre).toBe(false);
    }
  });

  it('returns 10 cells for split layout (rows 1 and 3)', () => {
    const cells = warzoneSlotCells(10);
    expect(cells).toHaveLength(10);
    expect(cells.every((c) => c.row === 1 || c.row === 3)).toBe(true);
  });

  it('returns 5 cells in the right column for focus layout', () => {
    const cells = warzoneSlotCells(5);
    expect(cells).toHaveLength(5);
    expect(cells.every((c) => c.col === 2)).toBe(true);
  });
});

describe('assignStableSlots', () => {
  it('first fill assigns slots 1..n in eligibleIds order', () => {
    const { assignment, overflow } = assignStableSlots({
      eligibleIds: ['a', 'b', 'c'],
      previous: new Map(),
    });
    expect(overflow).toBe(0);
    expect(assignment.get(1)).toBe('a');
    expect(assignment.get(2)).toBe('b');
    expect(assignment.get(3)).toBe('c');
    expect(assignment.size).toBe(3);
  });

  it('keeps previous slots for ids still eligible; drops ineligible', () => {
    const previous = new Map<number, string>([
      [1, 'a'],
      [2, 'b'],
      [5, 'c'],
    ]);
    const { assignment } = assignStableSlots({
      eligibleIds: ['a', 'c', 'd'],
      previous,
    });
    expect(assignment.get(1)).toBe('a');
    expect(assignment.get(2)).toBe('d');
    expect(assignment.get(5)).toBe('c');
  });

  it('reuses lowest vacated slot when middle occupant drops', () => {
    const previous = new Map<number, string>([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
    const { assignment } = assignStableSlots({
      eligibleIds: ['a', 'c', 'd'],
      previous,
    });
    expect(assignment.get(1)).toBe('a');
    expect(assignment.get(2)).toBe('d');
    expect(assignment.get(3)).toBe('c');
  });

  it('assigns new ids to lowest empty slot', () => {
    const previous = new Map<number, string>([[1, 'a']]);
    const { assignment } = assignStableSlots({
      eligibleIds: ['a', 'b'],
      previous,
    });
    expect(assignment.get(1)).toBe('a');
    expect(assignment.get(2)).toBe('b');
  });

  it('reports overflow when more than 16 eligible ids', () => {
    const ids = Array.from({ length: 18 }, (_, i) => `t${i}`);
    const { assignment, overflow } = assignStableSlots({
      eligibleIds: ids,
      previous: new Map(),
    });
    expect(assignment.size).toBe(16);
    expect(overflow).toBe(2);
  });

  it('respects a smaller slotCount for compact layouts', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `t${i}`);
    const { assignment, overflow } = assignStableSlots({
      eligibleIds: ids,
      previous: new Map(),
      slotCount: 5,
    });
    expect(assignment.size).toBe(5);
    expect(overflow).toBe(3);
  });

  it('drops previous slots beyond the active slotCount', () => {
    const previous = new Map<number, string>([
      [1, 'a'],
      [8, 'b'],
    ]);
    const { assignment } = assignStableSlots({
      eligibleIds: ['a', 'b'],
      previous,
      slotCount: 5,
    });
    expect(assignment.get(1)).toBe('a');
    expect(assignment.has(8)).toBe(false);
    expect(assignment.get(2)).toBe('b');
  });

  it('applies reserved slot when provided', () => {
    const { assignment } = assignStableSlots({
      eligibleIds: ['a', 'b'],
      previous: new Map(),
      reserved: { slot: 8, taskId: 'new' },
    });
    expect(assignment.get(8)).toBe('new');
    expect(assignment.get(1)).toBe('a');
    expect(assignment.get(2)).toBe('b');
  });

  it('keeps reserved taskId even when not yet eligible', () => {
    const { assignment } = assignStableSlots({
      eligibleIds: ['a'],
      previous: new Map([[1, 'a']]),
      reserved: { slot: 4, taskId: 'fresh' },
    });
    expect(assignment.get(4)).toBe('fresh');
    expect(assignment.get(1)).toBe('a');
  });

  it('displaces previous occupant of reserved slot', () => {
    const { assignment } = assignStableSlots({
      eligibleIds: ['a', 'b'],
      previous: new Map([
        [1, 'a'],
        [2, 'b'],
      ]),
      reserved: { slot: 1, taskId: 'fresh' },
    });
    expect(assignment.get(1)).toBe('fresh');
    expect(assignment.get(2)).toBe('b');
    expect([...assignment.values()]).toContain('a');
  });
});

describe('resolveWarzoneSlotAction', () => {
  it('selects when assignment and list row both present', () => {
    expect(
      resolveWarzoneSlotAction({
        slot: 3,
        assignedTaskId: 't1',
        taskInList: true,
      })
    ).toEqual({ type: 'select', taskId: 't1' });
  });

  it('is pending when assigned but row missing (reserved loading)', () => {
    expect(
      resolveWarzoneSlotAction({
        slot: 3,
        assignedTaskId: 't1',
        taskInList: false,
      })
    ).toEqual({ type: 'pending', taskId: 't1' });
  });

  it('creates when slot is empty', () => {
    expect(
      resolveWarzoneSlotAction({
        slot: 7,
        assignedTaskId: undefined,
        taskInList: false,
      })
    ).toEqual({ type: 'create', slot: 7 });
  });
});

describe('shouldClearReserved', () => {
  it('clears once reserved task is in eligible ids', () => {
    expect(shouldClearReserved({ slot: 2, taskId: 'x' }, ['a', 'x'])).toBe(
      true
    );
  });

  it('keeps reserved until task appears in eligible', () => {
    expect(shouldClearReserved({ slot: 2, taskId: 'x' }, ['a'])).toBe(false);
    expect(shouldClearReserved(null, ['a'])).toBe(false);
  });
});
