import { describe, it, expect, vi } from "vitest";
import { buildBranchEntities, filterBranchEntities } from "./projectEntities.ts";
import type { Branch, Worktree, Feature, FactoryOverview } from "../api.ts";

function branch(overrides: Partial<Branch> = {}): Branch {
  return {
    name: "main",
    current: false,
    upstream: null,
    lastCommit: null,
    lastCommitDate: null,
    lastCommitTs: null,
    author: null,
    ahead: 0,
    behind: 0,
    remoteOnly: false,
    ...overrides,
  };
}

function worktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/wt/main",
    branch: "main",
    head: "abc123",
    bare: false,
    detached: false,
    locked: false,
    isMain: true,
    lastCommitTs: null,
    author: null,
    dirty: false,
    ...overrides,
  };
}

function factory(overrides: Partial<FactoryOverview> = {}): FactoryOverview {
  return { features: [], branchState: {}, ...overrides };
}

const noStatus = () => undefined;
const noServer = () => false;

describe("buildBranchEntities", () => {
  it("derives ts from lastCommitTs, defaulting null to 0", () => {
    const { all } = buildBranchEntities({
      branches: [branch({ name: "a", lastCommitTs: 100 }), branch({ name: "b", lastCommitTs: null })],
      worktrees: [],
      factory: factory(),
      statusFor: noStatus,
      isServerRunning: noServer,
    });
    expect(all.find((e) => e.name === "a")!.ts).toBe(100);
    expect(all.find((e) => e.name === "b")!.ts).toBe(0);
  });

  it("joins a worktree by branch name for worktreePath/dirty/lastCommitTs", () => {
    const { all } = buildBranchEntities({
      branches: [branch({ name: "feat/one", lastCommitTs: 10 })],
      worktrees: [worktree({ path: "/wt/one", branch: "feat/one", lastCommitTs: 500, dirty: true })],
      factory: factory(),
      statusFor: noStatus,
      isServerRunning: noServer,
    });
    const entity = all.find((e) => e.name === "feat/one")!;
    expect(entity.worktreePath).toBe("/wt/one");
    expect(entity.hasWorktree).toBe(true);
    expect(entity.dirty).toBe(true);
    expect(entity.ts).toBe(500); // worktree's lastCommitTs wins over the branch's own
  });

  it("falls back to factory.branchState for worktreePath/createdAt when there's no live worktree", () => {
    const { all } = buildBranchEntities({
      branches: [branch({ name: "feat/gone", lastCommitTs: null })],
      worktrees: [],
      factory: factory({ branchState: { "feat/gone": { worktreePath: "/wt/gone", createdAt: 42 } } }),
      statusFor: noStatus,
      isServerRunning: noServer,
    });
    const entity = all.find((e) => e.name === "feat/gone")!;
    expect(entity.worktreePath).toBe("/wt/gone");
    expect(entity.hasWorktree).toBe(true);
    expect(entity.ts).toBe(42);
  });

  it("a branch with no worktree and no branchState has hasWorktree=false and ts=0", () => {
    const { all } = buildBranchEntities({
      branches: [branch({ name: "feat/bare" })],
      worktrees: [],
      factory: factory(),
      statusFor: noStatus,
      isServerRunning: noServer,
    });
    const entity = all.find((e) => e.name === "feat/bare")!;
    expect(entity.hasWorktree).toBe(false);
    expect(entity.worktreePath).toBeUndefined();
    expect(entity.ts).toBe(0);
  });

  it("floats a working branch's ts to Number.MAX_SAFE_INTEGER, ahead of everything else", () => {
    const statusFor = (b: string) => (b === "feat/working" ? ("working" as const) : undefined);
    const { all } = buildBranchEntities({
      branches: [branch({ name: "feat/working", lastCommitTs: 1 }), branch({ name: "feat/recent", lastCommitTs: 9999 })],
      worktrees: [],
      factory: factory(),
      statusFor,
      isServerRunning: noServer,
    });
    expect(all.map((e) => e.name)).toEqual(["feat/working", "feat/recent"]);
    expect(all[0].ts).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("sets agentStatus from statusFor and marks isCurrent from the git branch", () => {
    const statusFor = (b: string) => (b === "feat/one" ? ("awaitingInput" as const) : undefined);
    const { all } = buildBranchEntities({
      branches: [branch({ name: "feat/one", current: true }), branch({ name: "main", current: false })],
      worktrees: [],
      factory: factory(),
      statusFor,
      isServerRunning: noServer,
    });
    expect(all.find((e) => e.name === "feat/one")!.agentStatus).toBe("awaitingInput");
    expect(all.find((e) => e.name === "feat/one")!.isCurrent).toBe(true);
    expect(all.find((e) => e.name === "main")!.isCurrent).toBe(false);
  });

  it("sets serverRunning via isServerRunning(worktreePath)", () => {
    const isServerRunning = vi.fn((cwd?: string) => cwd === "/wt/one");
    const { all } = buildBranchEntities({
      branches: [branch({ name: "feat/one" }), branch({ name: "feat/two" })],
      worktrees: [worktree({ path: "/wt/one", branch: "feat/one" }), worktree({ path: "/wt/two", branch: "feat/two" })],
      factory: factory(),
      statusFor: noStatus,
      isServerRunning,
    });
    expect(all.find((e) => e.name === "feat/one")!.serverRunning).toBe(true);
    expect(all.find((e) => e.name === "feat/two")!.serverRunning).toBe(false);
    expect(isServerRunning).toHaveBeenCalledWith("/wt/one");
  });

  it("groups branches by feature (in factory.features order) and puts the rest in unfiled", () => {
    const features: Feature[] = [
      { id: "f1", name: "Feature One", branches: ["feat/a", "feat/b"] },
      { id: "f2", name: "Feature Two", branches: ["feat/c"] },
    ];
    const { featureGroups, unfiled } = buildBranchEntities({
      branches: [
        branch({ name: "feat/a", lastCommitTs: 10 }),
        branch({ name: "feat/b", lastCommitTs: 20 }),
        branch({ name: "feat/c", lastCommitTs: 30 }),
        branch({ name: "main", lastCommitTs: 5 }),
      ],
      worktrees: [],
      factory: factory({ features }),
      statusFor: noStatus,
      isServerRunning: noServer,
    });
    expect(featureGroups.map((g) => g.feature.id)).toEqual(["f1", "f2"]);
    expect(featureGroups[0].branches.map((e) => e.name)).toEqual(["feat/b", "feat/a"]); // ts desc
    expect(featureGroups[1].branches.map((e) => e.name)).toEqual(["feat/c"]);
    expect(unfiled.map((e) => e.name)).toEqual(["main"]);
  });

  it("sets featureId on branch entities filed into a feature, leaving it undefined for unfiled ones", () => {
    const features: Feature[] = [{ id: "f1", name: "Feature One", branches: ["feat/a"] }];
    const { all } = buildBranchEntities({
      branches: [branch({ name: "feat/a" }), branch({ name: "main" })],
      worktrees: [],
      factory: factory({ features }),
      statusFor: noStatus,
      isServerRunning: noServer,
    });
    expect(all.find((e) => e.name === "feat/a")!.featureId).toBe("f1");
    expect(all.find((e) => e.name === "main")!.featureId).toBeUndefined();
  });

  it("sorts `all` by ts desc, then name asc as a stable tie-break", () => {
    const { all } = buildBranchEntities({
      branches: [
        branch({ name: "zeta", lastCommitTs: 100 }),
        branch({ name: "alpha", lastCommitTs: 200 }),
        branch({ name: "beta", lastCommitTs: 200 }),
      ],
      worktrees: [],
      factory: factory(),
      statusFor: noStatus,
      isServerRunning: noServer,
    });
    expect(all.map((e) => e.name)).toEqual(["alpha", "beta", "zeta"]);
  });

  it("omits a feature's member branch from its group when the git branch no longer exists", () => {
    const features: Feature[] = [{ id: "f1", name: "Feature One", branches: ["feat/deleted", "feat/a"] }];
    const { featureGroups } = buildBranchEntities({
      branches: [branch({ name: "feat/a" })],
      worktrees: [],
      factory: factory({ features }),
      statusFor: noStatus,
      isServerRunning: noServer,
    });
    expect(featureGroups[0].branches.map((e) => e.name)).toEqual(["feat/a"]);
  });
});

describe("filterBranchEntities", () => {
  const list = buildBranchEntities({
    branches: [branch({ name: "feature/login", lastCommitTs: 100 }), branch({ name: "main", lastCommitTs: 50 })],
    worktrees: [],
    factory: factory(),
    statusFor: noStatus,
    isServerRunning: noServer,
  }).all;

  it("returns the list unchanged for an empty or whitespace query", () => {
    expect(filterBranchEntities(list, "")).toEqual(list);
    expect(filterBranchEntities(list, "   ")).toEqual(list);
  });

  it("filters case-insensitively by substring over the branch name", () => {
    expect(filterBranchEntities(list, "LOGIN").map((e) => e.name)).toEqual(["feature/login"]);
  });
});
