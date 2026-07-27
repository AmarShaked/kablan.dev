import { describe, it, expect } from "vitest";
import { shouldNotify } from "./notify.ts";
import type { NotificationSettings } from "../api.ts";

const cfg = (overrides: Partial<NotificationSettings> = {}): NotificationSettings => ({
  enabled: true,
  events: ["awaitingInput", "failed", "done"],
  ...overrides,
});

describe("shouldNotify", () => {
  it("true when enabled and transitioning into a listed status", () => {
    expect(shouldNotify("working", "awaitingInput", cfg())).toBe(true);
    expect(shouldNotify(undefined, "failed", cfg())).toBe(true);
    expect(shouldNotify("working", "done", cfg())).toBe(true);
  });

  it("false when notifications are disabled", () => {
    expect(shouldNotify("working", "awaitingInput", cfg({ enabled: false }))).toBe(false);
  });

  it("false when prev === next (no repeat notifications for the same status)", () => {
    expect(shouldNotify("awaitingInput", "awaitingInput", cfg())).toBe(false);
    expect(shouldNotify("failed", "failed", cfg())).toBe(false);
  });

  it("false when next's status name is not in cfg.events", () => {
    expect(shouldNotify("idle", "working", cfg())).toBe(false);
    expect(shouldNotify("awaitingInput", "working", cfg())).toBe(false);
  });

  it("false when events list is empty even though enabled and transitioning", () => {
    expect(shouldNotify("working", "done", cfg({ events: [] }))).toBe(false);
  });

  it("respects a partial events list (only notifies for configured names)", () => {
    expect(shouldNotify("working", "failed", cfg({ events: ["awaitingInput"] }))).toBe(false);
    expect(shouldNotify("working", "awaitingInput", cfg({ events: ["awaitingInput"] }))).toBe(true);
  });
});
