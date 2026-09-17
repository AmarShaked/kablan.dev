export type WarzoneToolbarStatusPart =
  | { key: 'needsYou'; count: number }
  | { key: 'moreNotShown'; count: number };

/** Pure helper for toolbar overflow / needs-you copy segments. */
export function warzoneToolbarStatusParts(args: {
  needsYouCount: number;
  overflow: number;
}): WarzoneToolbarStatusPart[] {
  const parts: WarzoneToolbarStatusPart[] = [];
  if (args.needsYouCount > 0) {
    parts.push({ key: 'needsYou', count: args.needsYouCount });
  }
  if (args.overflow > 0) {
    parts.push({ key: 'moreNotShown', count: args.overflow });
  }
  return parts;
}

/** Apply or clear `task` on a search-params snapshot (focus / Esc / create). */
export function applyWarzoneTaskParam(
  prev: URLSearchParams,
  taskId: string | null
): URLSearchParams {
  const next = new URLSearchParams(prev);
  if (taskId) {
    next.set('task', taskId);
  } else {
    next.delete('task');
  }
  return next;
}

/** Clear reserved create-slot when filter excludes that task's project. */
export function shouldDropReservedForProjectFilter(args: {
  reserved: { slot: number; taskId: string } | null;
  projectFilter: string | null;
  taskProjectId: string | undefined;
}): boolean {
  if (!args.reserved || !args.projectFilter) return false;
  return args.taskProjectId !== args.projectFilter;
}
