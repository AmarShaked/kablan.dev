/** Client-side unread tracking for PocketBase chats (per signed-in user). */

function unreadKey(userId: string): string {
  return `kablan:chat-unread:${userId}`;
}

function lastReadKey(userId: string): string {
  return `kablan:chat-last-read:${userId}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota — unread is best-effort.
  }
}

export function getUnreadChatIds(userId: string): Set<string> {
  const list = readJson<string[]>(unreadKey(userId), []);
  return new Set(list);
}

export function persistUnreadChatIds(userId: string, ids: Set<string>): void {
  writeJson(unreadKey(userId), [...ids]);
}

export function getChatLastReadMap(userId: string): Record<string, string> {
  return readJson<Record<string, string>>(lastReadKey(userId), {});
}

export function setChatLastRead(
  userId: string,
  chatId: string,
  iso: string = new Date().toISOString()
): void {
  const map = getChatLastReadMap(userId);
  map[chatId] = iso;
  writeJson(lastReadKey(userId), map);
}

export function getChatLastRead(
  userId: string,
  chatId: string
): string | null {
  return getChatLastReadMap(userId)[chatId] ?? null;
}
