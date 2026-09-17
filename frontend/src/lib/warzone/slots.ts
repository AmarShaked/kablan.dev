export const WARZONE_LAYOUT_IDS = [16, 10, 5] as const;
export type WarzoneLayoutId = (typeof WARZONE_LAYOUT_IDS)[number];

/** Default / max ring size — kept for callers that mean "full ring". */
export const WARZONE_SLOT_COUNT = 16;

export type WarzoneSlotCell = {
  slot: number;
  row: number;
  col: number;
};

export type WarzoneLayoutDef = {
  id: WarzoneLayoutId;
  slotCount: number;
  cols: number;
  rows: number;
  cells: WarzoneSlotCell[];
  centre: { gridRow: string; gridColumn: string };
};

const LAYOUT_RING_16: WarzoneLayoutDef = {
  id: 16,
  slotCount: 16,
  cols: 5,
  rows: 5,
  cells: [
    { slot: 1, row: 1, col: 1 },
    { slot: 2, row: 1, col: 2 },
    { slot: 3, row: 1, col: 3 },
    { slot: 4, row: 1, col: 4 },
    { slot: 5, row: 1, col: 5 },
    { slot: 6, row: 2, col: 5 },
    { slot: 7, row: 3, col: 5 },
    { slot: 8, row: 4, col: 5 },
    { slot: 9, row: 5, col: 5 },
    { slot: 10, row: 5, col: 4 },
    { slot: 11, row: 5, col: 3 },
    { slot: 12, row: 5, col: 2 },
    { slot: 13, row: 5, col: 1 },
    { slot: 14, row: 4, col: 1 },
    { slot: 15, row: 3, col: 1 },
    { slot: 16, row: 2, col: 1 },
  ],
  centre: { gridRow: '2 / 5', gridColumn: '2 / 5' },
};

/** Three rows: five tiles, full-width chat, five tiles. */
const LAYOUT_SPLIT_10: WarzoneLayoutDef = {
  id: 10,
  slotCount: 10,
  cols: 5,
  rows: 3,
  cells: [
    { slot: 1, row: 1, col: 1 },
    { slot: 2, row: 1, col: 2 },
    { slot: 3, row: 1, col: 3 },
    { slot: 4, row: 1, col: 4 },
    { slot: 5, row: 1, col: 5 },
    { slot: 6, row: 3, col: 1 },
    { slot: 7, row: 3, col: 2 },
    { slot: 8, row: 3, col: 3 },
    { slot: 9, row: 3, col: 4 },
    { slot: 10, row: 3, col: 5 },
  ],
  centre: { gridRow: '2', gridColumn: '1 / 6' },
};

/** Chat fills the left; five tiles in a right column. */
const LAYOUT_COLUMN_5: WarzoneLayoutDef = {
  id: 5,
  slotCount: 5,
  cols: 2,
  rows: 5,
  cells: [
    { slot: 1, row: 1, col: 2 },
    { slot: 2, row: 2, col: 2 },
    { slot: 3, row: 3, col: 2 },
    { slot: 4, row: 4, col: 2 },
    { slot: 5, row: 5, col: 2 },
  ],
  centre: { gridRow: '1 / 6', gridColumn: '1' },
};

const LAYOUTS: Record<WarzoneLayoutId, WarzoneLayoutDef> = {
  16: LAYOUT_RING_16,
  10: LAYOUT_SPLIT_10,
  5: LAYOUT_COLUMN_5,
};

export function parseWarzoneLayout(
  raw: string | null | undefined
): WarzoneLayoutId {
  if (raw === '10' || raw === '5' || raw === '16') {
    return Number(raw) as WarzoneLayoutId;
  }
  return 16;
}

export function warzoneLayout(id: WarzoneLayoutId): WarzoneLayoutDef {
  return LAYOUTS[id];
}

export function warzoneSlotCells(
  layoutId: WarzoneLayoutId = 16
): WarzoneSlotCell[] {
  return warzoneLayout(layoutId).cells.map((cell) => ({ ...cell }));
}

export function assignStableSlots(args: {
  eligibleIds: string[];
  previous: Map<number, string>;
  reserved?: { slot: number; taskId: string } | null;
  slotCount?: number;
}): { assignment: Map<number, string>; overflow: number } {
  const slotCount = args.slotCount ?? WARZONE_SLOT_COUNT;
  const eligibleSet = new Set(args.eligibleIds);
  const assignment = new Map<number, string>();

  for (const [slot, taskId] of args.previous) {
    if (slot < 1 || slot > slotCount) continue;
    if (eligibleSet.has(taskId)) {
      assignment.set(slot, taskId);
    }
  }

  if (args.reserved) {
    const { slot, taskId } = args.reserved;
    if (slot >= 1 && slot <= slotCount) {
      for (const [s, id] of assignment) {
        if (s === slot && id !== taskId) {
          assignment.delete(s);
        }
      }
      assignment.set(slot, taskId);
    }
  }

  const assignedIds = new Set(assignment.values());

  for (let slot = 1; slot <= slotCount; slot++) {
    if (assignment.has(slot)) {
      continue;
    }
    const nextId = args.eligibleIds.find((id) => !assignedIds.has(id));
    if (!nextId) {
      break;
    }
    assignment.set(slot, nextId);
    assignedIds.add(nextId);
  }

  const assignedCount = new Set(assignment.values()).size;
  const overflow = Math.max(0, args.eligibleIds.length - assignedCount);

  return { assignment, overflow };
}

export type WarzoneSlotAction =
  | { type: 'select'; taskId: string }
  | { type: 'create'; slot: number }
  | { type: 'pending'; taskId: string };

/** Map assignment + list presence to click behaviour (reserved ids may lack a row yet). */
export function resolveWarzoneSlotAction(args: {
  slot: number;
  assignedTaskId: string | undefined;
  taskInList: boolean;
}): WarzoneSlotAction {
  if (args.assignedTaskId) {
    if (args.taskInList) {
      return { type: 'select', taskId: args.assignedTaskId };
    }
    return { type: 'pending', taskId: args.assignedTaskId };
  }
  return { type: 'create', slot: args.slot };
}

export function shouldClearReserved(
  reserved: { slot: number; taskId: string } | null | undefined,
  eligibleIds: readonly string[]
): boolean {
  return Boolean(reserved && eligibleIds.includes(reserved.taskId));
}
