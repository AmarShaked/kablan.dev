import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

/** Persistent expand/collapse state for the cockpit transcript.
 *
 * Each collapsible transcript entry (a ToolGroup, a ToolLine's result reveal, a diff, a thinking
 * block, a subagent card) owns an open/closed flag. That flag used to live in ephemeral component
 * `useState`, so reopening a cockpit or reloading the app reset everything to collapsed. Here we
 * back it with localStorage, keyed by the agent key + a stable per-entry id (the prim `key`), so a
 * remount/reload restores exactly what the user had expanded. Default (no stored value) stays
 * collapsed. Mirrors the localStorage store pattern in `projectIcons.tsx` / `inboxRead.ts`. */

const STORAGE_KEY = "kablan:chatExpand";

/** Context carrying the current pane's agent key down to the collapsible entry components, so they
 * can namespace their persisted open state without prop-drilling the key through every render. */
export const AgentKeyContext = createContext<string>("");

function hasStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function load(): Record<string, boolean> {
  if (!hasStorage()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const obj = raw ? (JSON.parse(raw) as unknown) : {};
    return obj && typeof obj === "object" ? (obj as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

let state: Record<string, boolean> = load();
const listeners = new Set<() => void>();

function persist() {
  if (hasStorage()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota / unavailable storage — the in-memory map still drives the UI this session
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Storage key encoding agent key + per-entry id. */
export function expandKey(agentKey: string, id: string): string {
  return `${agentKey}::${id}`;
}

/** Non-reactive read of an entry's open state (defaults to `fallback`, normally collapsed). */
export function isExpanded(agentKey: string, id: string, fallback = false): boolean {
  const k = expandKey(agentKey, id);
  return k in state ? state[k] : fallback;
}

/** Set (and persist) an entry's open state, notifying subscribers. */
export function setExpanded(agentKey: string, id: string, open: boolean) {
  state = { ...state, [expandKey(agentKey, id)]: open };
  persist();
}

/** Drop all in-memory + persisted expand state. Primarily for test isolation (the store is a
 * module-level singleton shared across mounts, so tests reusing the same keys would otherwise leak
 * open state into each other). */
export function resetExpandStore() {
  state = {};
  if (hasStorage()) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  listeners.forEach((l) => l());
}

/** Reactive [open, setOpen] for a collapsible entry, namespaced by the ambient `AgentKeyContext`
 * and the given stable entry `id`. Persists across reloads/remounts; defaults to `fallback`. */
export function useExpanded(id: string, fallback = false): [boolean, (open: boolean) => void] {
  const agentKey = useContext(AgentKeyContext);
  const snapshot = useSyncExternalStore(subscribe, () => state);
  const k = expandKey(agentKey, id);
  const open = k in snapshot ? snapshot[k] : fallback;
  const set = useCallback((v: boolean) => setExpanded(agentKey, id, v), [agentKey, id]);
  return [open, set];
}
