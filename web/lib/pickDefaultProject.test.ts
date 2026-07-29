import { describe, it, expect } from "vitest";
import { pickDefaultProject } from "./pickDefaultProject.ts";
import type { ProjectSummary } from "../api.ts";

function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    name: "proj",
    path: "/proj",
    currentBranch: "main",
    detectedCommand: null,
    devCommand: "",
    hasEnv: false,
    packageManager: "npm",
    lastCommitTs: null,
    ...overrides,
  };
}

describe("pickDefaultProject", () => {
  it("returns the last-opened project when it's present in the list", () => {
    const projects = [
      project({ name: "a", lastCommitTs: 100 }),
      project({ name: "b", lastCommitTs: 200 }),
    ];
    expect(pickDefaultProject(projects, "a")).toBe("a");
  });

  it("falls back to the most-recent-activity project when the last-opened one is stale/missing", () => {
    const projects = [
      project({ name: "a", lastCommitTs: 100 }),
      project({ name: "b", lastCommitTs: 300 }),
      project({ name: "c", lastCommitTs: 200 }),
    ];
    expect(pickDefaultProject(projects, "gone")).toBe("b");
  });

  it("falls back to the most-recent-activity project when lastOpenedName is null", () => {
    const projects = [
      project({ name: "a", lastCommitTs: 100 }),
      project({ name: "b", lastCommitTs: 300 }),
    ];
    expect(pickDefaultProject(projects, null)).toBe("b");
  });

  it("returns null for an empty project list", () => {
    expect(pickDefaultProject([], "anything")).toBeNull();
  });

  it("returns the first project when all lastCommitTs are null", () => {
    const projects = [
      project({ name: "a", lastCommitTs: null }),
      project({ name: "b", lastCommitTs: null }),
    ];
    expect(pickDefaultProject(projects, null)).toBe("a");
  });

  it("sorts null lastCommitTs last, behind any project with a real timestamp", () => {
    const projects = [
      project({ name: "a", lastCommitTs: null }),
      project({ name: "b", lastCommitTs: 50 }),
    ];
    expect(pickDefaultProject(projects, null)).toBe("b");
  });
});
