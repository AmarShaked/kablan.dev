import { describe, it, expect } from "vitest";
import { branchKey } from "./agentKey.ts";

describe("branchKey", () => {
  it("joins project and branch with '::branch:'", () => {
    expect(branchKey("proj", "feat/one")).toBe("proj::branch:feat/one");
  });

  it("shares the '${project}::' prefix consumed by unreadForProject", () => {
    expect(branchKey("proj", "feat/one").startsWith("proj::")).toBe(true);
  });

  it("tolerates branch names containing '/'", () => {
    expect(branchKey("proj", "feature/nested/branch")).toBe("proj::branch:feature/nested/branch");
  });
});
