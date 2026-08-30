import { TaskStatus } from 'shared/types';

/**
 * The order statuses are shown in, and therefore the number each answers to in the picker.
 *
 * Here rather than beside the picker because a module that exports a component must export only
 * components: anything else breaks Fast Refresh for it and for everything that imports it.
 */
export const STATUS_ORDER: TaskStatus[] = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
];

export const statusLabels: Record<TaskStatus, string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

/**
 * The one colour each status is, as a CSS variable name.
 *
 * Everything that draws a status reads this: the glyph on a card, row and sidebar, the list's
 * section headings, and the board's column headings. They used to carry separate mappings, and
 * drifted — In Review was amber in a heading and green in the glyph directly beneath it.
 *
 * The progression is deliberate: grey while untouched, amber while it is being worked, green
 * once it is ready to look at, and a distinct blue for finished, so "done" cannot be mistaken
 * for "nearly done" at a glance. Cancelled is grey rather than red — it is a decision, not a
 * failure, and red is what a failed attempt uses.
 */
export const statusColorVars: Record<TaskStatus, string> = {
  todo: '--neutral-foreground',
  inprogress: '--warning',
  inreview: '--success',
  done: '--info',
  cancelled: '--neutral-foreground',
};

/** @deprecated Use `statusColorVars`; kept as an alias so nothing silently keeps the old map. */
export const statusBoardColors = statusColorVars;
