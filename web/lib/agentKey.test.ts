import { describe, it, expect } from "vitest";
import { branchKey, parseBranchKey } from "./agentKey.ts";

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

describe("parseBranchKey", () => {
  it("splits a simple key into project and branch", () => {
    expect(parseBranchKey("proj::branch:feat/one")).toEqual({ project: "proj", branch: "feat/one" });
  });

  it("splits only on the FIRST '::branch:' when the branch name itself contains '/'", () => {
    expect(parseBranchKey("proj::branch:feature/nested/branch")).toEqual({
      project: "proj",
      branch: "feature/nested/branch",
    });
  });

  it("round-trips with branchKey", () => {
    const key = branchKey("my-proj", "feat/deep/nested");
    expect(parseBranchKey(key)).toEqual({ project: "my-proj", branch: "feat/deep/nested" });
  });

  it("returns null for a key without the '::branch:' delimiter", () => {
    expect(parseBranchKey("not-a-branch-key")).toBeNull();
  });
});
