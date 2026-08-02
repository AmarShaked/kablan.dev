import { describe, it, expect, beforeEach } from "vitest";
import { readKey, isRead, markRead, markAllRead } from "./inboxRead.ts";
import type { InboxEntry } from "../api.ts";

function entry(overrides: Partial<InboxEntry> = {}): InboxEntry {
  return { project: "proj-a", branch: "feat/one", status: "awaitingInput", ...overrides };
}

beforeEach(() => {
  localStorage.clear();
  // The module keeps an in-memory read set that persists across tests; `isReadNow` reads from
  // (freshly cleared) localStorage instead, and each test uses unique project/branch keys, so
  // membership checks stay isolated.
});

describe("readKey", () => {
  it("encodes project + branch + status", () => {
    expect(readKey(entry({ project: "p", branch: "b", status: "failed" }))).toBe("p b failed");
  });

  it("differs when the status changes (so a new status re-surfaces as unread)", () => {
    const awaiting = entry({ status: "awaitingInput" });
    const done = entry({ status: "done" });
    expect(readKey(awaiting)).not.toBe(readKey(done));
  });
});

describe("isRead / markRead round-trip", () => {
  it("an entry is not read until marked, then is read", () => {
    const e = entry({ project: "rt1", branch: "b1", status: "awaitingInput" });
    // Build a fresh set reflecting current storage state via isRead against markRead's effect.
    expect(isReadNow(e)).toBe(false);
    markRead([e]);
    expect(isReadNow(e)).toBe(true);
  });

  it("persists the read key to localStorage", () => {
    const e = entry({ project: "persist1", branch: "b", status: "failed" });
    markRead([e]);
    const raw = JSON.parse(localStorage.getItem("kablan:inboxRead") || "[]") as string[];
    expect(raw).toContain(readKey(e));
  });

  it("re-surfaces an entry as unread when its status changes", () => {
    const awaiting = entry({ project: "resurf1", branch: "b", status: "awaitingInput" });
    markRead([awaiting]);
    expect(isReadNow(awaiting)).toBe(true);

    // Same branch, new attention status → different key → unread again.
    const failed = entry({ project: "resurf1", branch: "b", status: "failed" });
    expect(isReadNow(failed)).toBe(false);
  });
});

describe("markAllRead", () => {
  it("marks every given entry read", () => {
    const a = entry({ project: "all1", branch: "a", status: "awaitingInput" });
    const b = entry({ project: "all1", branch: "b", status: "failed" });
    expect(isReadNow(a)).toBe(false);
    expect(isReadNow(b)).toBe(false);

    markAllRead([a, b]);

    expect(isReadNow(a)).toBe(true);
    expect(isReadNow(b)).toBe(true);
  });

  it("is a no-op for an empty list", () => {
    const before = localStorage.getItem("kablan:inboxRead");
    markAllRead([]);
    expect(localStorage.getItem("kablan:inboxRead")).toBe(before);
  });
});

/** Helper: read the persisted set fresh and check membership (mirrors what the hook exposes). */
function isReadNow(e: InboxEntry): boolean {
  const raw = JSON.parse(localStorage.getItem("kablan:inboxRead") || "[]") as string[];
  return isRead(new Set(raw), e);
}
