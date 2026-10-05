/** Per-chat pinned Kablan project for agent turns. */

function pinKey(userId: string): string {
  return `kablan:chat-pinned-project:${userId}`;
}

function readMap(userId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(pinKey(userId));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeMap(userId: string, map: Record<string, string>): void {
  try {
    localStorage.setItem(pinKey(userId), JSON.stringify(map));
  } catch {
    // Private mode / quota — pin is best-effort.
  }
}

export function getPinnedProjectId(
  userId: string,
  chatId: string
): string | null {
  return readMap(userId)[chatId] ?? null;
}

export function setPinnedProjectId(
  userId: string,
  chatId: string,
  projectId: string | null
): void {
  const map = readMap(userId);
  if (projectId) map[chatId] = projectId;
  else delete map[chatId];
  writeMap(userId, map);
}

/** Drag payload when dragging a project from the sidebar into chat. */
export const KABLAN_PROJECT_DRAG_TYPE = 'application/x-kablan-project';

export type ProjectDragPayload = {
  id: string;
  name: string;
};

export function encodeProjectDrag(payload: ProjectDragPayload): string {
  return JSON.stringify(payload);
}

export function decodeProjectDrag(raw: string): ProjectDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as ProjectDragPayload;
    if (
      typeof parsed?.id === 'string' &&
      typeof parsed?.name === 'string' &&
      parsed.id &&
      parsed.name
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}
