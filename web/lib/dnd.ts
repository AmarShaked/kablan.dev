/** Native HTML5 drag-and-drop plumbing for the branch-centric sidebar (`SidebarRecent`) — no
 * library, just `draggable` + `onDragStart`/`onDragOver`/`onDrop` and the browser's
 * `DataTransfer`. Kept separate from the component so the actual "what happens when you drop
 * here" math is a plain, synchronous function that's trivial to unit-test without simulating a
 * real drag gesture. */

export const BRANCH_DRAG_MIME = "application/x-kablan-branch";
export const FEATURE_DRAG_MIME = "application/x-kablan-feature";

export interface BranchDragPayload {
  kind: "branch";
  branch: string;
  /** The feature this branch was filed into at drag-start time, or undefined if it was
   * unfiled. Read back out of `dataTransfer` on drop (not from component state) so the drop
   * decision is driven by the same data a real cross-window/cross-frame drag would carry. */
  sourceFeatureId?: string;
}

export interface FeatureDragPayload {
  kind: "feature";
  featureId: string;
}

export function setBranchDragData(
  dt: DataTransfer,
  payload: { branch: string; sourceFeatureId?: string },
): void {
  const data: BranchDragPayload = { kind: "branch", branch: payload.branch };
  if (payload.sourceFeatureId) data.sourceFeatureId = payload.sourceFeatureId;
  dt.setData(BRANCH_DRAG_MIME, JSON.stringify(data));
}

export function getBranchDragData(dt: DataTransfer): BranchDragPayload | null {
  const raw = dt.getData(BRANCH_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.kind === "branch" && typeof parsed.branch === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function setFeatureDragData(dt: DataTransfer, featureId: string): void {
  const data: FeatureDragPayload = { kind: "feature", featureId };
  dt.setData(FEATURE_DRAG_MIME, JSON.stringify(data));
}

export function getFeatureDragData(dt: DataTransfer): FeatureDragPayload | null {
  const raw = dt.getData(FEATURE_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.kind === "feature" && typeof parsed.featureId === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Pure reorder math shared by both "reorder branches within a feature" and "reorder feature
 * folders": moves `draggedId` to sit at `dropIndex`, an index into the ORIGINAL `ids` array
 * (before removal) — i.e. "insert before whatever currently sits at that index"; an index equal
 * to `ids.length` means "insert at the end". Returns `ids` unchanged if `draggedId` isn't a
 * member. Never throws — an out-of-range `dropIndex` is clamped to the valid range.
 */
export function reorderIds(ids: string[], draggedId: string, dropIndex: number): string[] {
  const from = ids.indexOf(draggedId);
  if (from === -1) return ids;
  const rest = ids.filter((id) => id !== draggedId);
  // dropIndex was computed against the ORIGINAL array (which still includes draggedId) — shift
  // it left by one once draggedId is removed, if it sat before the drop point.
  const insertAt = Math.max(0, Math.min(from < dropIndex ? dropIndex - 1 : dropIndex, rest.length));
  rest.splice(insertAt, 0, draggedId);
  return rest;
}

/** Which half of a row's bounding box a pointer position falls in — drives whether the
 * drop-target insertion line renders above ("before") or below ("after") the hovered row. The
 * exact midpoint counts as "after" (arbitrary but deterministic tie-break). */
export function dropSide(rect: { top: number; height: number }, clientY: number): "before" | "after" {
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}
