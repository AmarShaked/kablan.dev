import { useSyncExternalStore } from "react";
import type { InboxEntry } from "../api.ts";

/** A client-side "read" overlay for the Inbox.
 *
 * The inbox is derived from LIVE agent statuses (awaitingInput/failed/done…), so there's no
 * server-side notion of "read" — the same branch reappears whenever its status changes. We track
 * read state locally in localStorage, keyed by project+branch+status. Including the status in the
 * key is deliberate: when a branch transitions to a NEW attention status it surfaces as unread
 * again, even if the user had dismissed its previous status. */

const KEY = "kablan:inboxRead";

/** Read key encoding project + branch + status. Status is part of the key so a status change
 * re-surfaces the entry as unread. */
export function readKey(entry: InboxEntry): string {
  return `${entry.project} ${entry.branch} ${entry.status}`;
}

function hasStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function load(): Set<string> {
  if (!hasStorage()) return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

let readSet: Set<string> = load();
const listeners = new Set<() => void>();

function emit() {
  if (hasStorage()) {
    try {
      localStorage.setItem(KEY, JSON.stringify([...readSet]));
    } catch {
      // ignore quota / unavailable storage — the in-memory set still drives the UI this session
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Whether this entry (project+branch+status) has been marked read. */
export function isRead(set: Set<string>, entry: InboxEntry): boolean {
  return set.has(readKey(entry));
}

/** Mark the given entries read (adds their keys, persists, notifies subscribers). */
export function markRead(entries: InboxEntry[]) {
  if (entries.length === 0) return;
  const next = new Set(readSet);
  for (const e of entries) next.add(readKey(e));
  readSet = next;
  emit();
}

/** Mark every given entry read — the "Clear" / "Mark all read" action. */
export function markAllRead(entries: InboxEntry[]) {
  markRead(entries);
}

/** Reactive access to the read set. Re-renders on any markRead/markAllRead. */
export function useInboxRead() {
  const set = useSyncExternalStore(subscribe, () => readSet);
  return { readSet: set, markRead, markAllRead };
}
