import { describe, it, expect } from "vitest";
import { taskForceKey, worktreeKey } from "./agentKey.ts";

describe("taskForceKey", () => {
  it("joins project and task-force id with '::'", () => {
    expect(taskForceKey("proj", "t1")).toBe("proj::t1");
  });
});

describe("worktreeKey", () => {
  it("joins project and worktree path with '::wt:'", () => {
    expect(worktreeKey("proj", "/wt/one")).toBe("proj::wt:/wt/one");
  });

  it("shares the '${project}::' prefix with taskForceKey", () => {
    const tfKey = taskForceKey("proj", "t1");
    const wtKey = worktreeKey("proj", "/wt/one");
    expect(tfKey.startsWith("proj::")).toBe(true);
    expect(wtKey.startsWith("proj::")).toBe(true);
  });
});
