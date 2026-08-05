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

  it("floats a branch up on recent live activity (activityAt, ms) over a newer commit with none", () => {
    // "a" has the newer COMMIT (200s) but no live activity; "b" has an older commit (100s) but
    // recent activity. activityAt is MILLISECONDS — 250_000ms → 250s, which beats a's 200s.
    const activityAt = (b: string) => (b === "b" ? 250_000 : undefined);
    const { all } = buildBranchEntities({
      branches: [branch({ name: "a", lastCommitTs: 200 }), branch({ name: "b", lastCommitTs: 100 })],
      worktrees: [],
      factory: factory(),
      statusFor: noStatus,
      isServerRunning: noServer,
      activityAt,
    });
    expect(all.map((e) => e.name)).toEqual(["b", "a"]);
    // Normalized to seconds (250_000ms → 250s), not left in ms.
    expect(all.find((e) => e.name === "b")!.ts).toBe(250);
  });

  it("counts a running dev server's start time (ms) as activity, normalized to seconds", () => {
    const serverStartedAt = (cwd?: string) => (cwd === "/wt/b" ? 300_000 : undefined);
    const { all } = buildBranchEntities({
      branches: [branch({ name: "a", lastCommitTs: 200 }), branch({ name: "b", lastCommitTs: 100 })],
      worktrees: [worktree({ path: "/wt/b", branch: "b", lastCommitTs: null })],
      factory: factory(),
      statusFor: noStatus,
      isServerRunning: noServer,
      serverStartedAt,
    });
    expect(all.map((e) => e.name)).toEqual(["b", "a"]);
    expect(all.find((e) => e.name === "b")!.ts).toBe(300);
  });

  it("keeps the working pin above a branch with more recent live activity", () => {
    const statusFor = (b: string) => (b === "wk" ? ("working" as const) : undefined);
    const activityAt = (b: string) => (b === "act" ? Date.now() : undefined);
    const { all } = buildBranchEntities({
      branches: [branch({ name: "wk", lastCommitTs: 1 }), branch({ name: "act", lastCommitTs: 1 })],
      worktrees: [],
      factory: factory(),
      statusFor,
      isServerRunning: noServer,
      activityAt,
    });
    expect(all[0].name).toBe("wk");
    expect(all[0].ts).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("keeps local-first ordering even when a remote-only branch has more recent activity", () => {
    const activityAt = (b: string) => (b === "remote" ? Date.now() : undefined);
    const { all } = buildBranchEntities({
      branches: [
        branch({ name: "local", lastCommitTs: 1, remoteOnly: false }),
        branch({ name: "remote", lastCommitTs: 1, remoteOnly: true }),
      ],
      worktrees: [],
      factory: factory(),
      statusFor: noStatus,
      isServerRunning: noServer,
      activityAt,
    });
    // The locally-present branch (older, no fresh activity) still ranks above the remote-only one.
    expect(all.map((e) => e.name)).toEqual(["local", "remote"]);
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
    // A feature's rows render in the STORED `feature.branches` order (not re-sorted by
    // activity) — so a manual drag-and-drop reorder sticks instead of being clobbered by ts.
    expect(featureGroups[0].branches.map((e) => e.name)).toEqual(["feat/a", "feat/b"]);
    expect(featureGroups[1].branches.map((e) => e.name)).toEqual(["feat/c"]);
    expect(unfiled.map((e) => e.name)).toEqual(["main"]);
  });

  it("sets hasActiveSession=true when a member branch has a live agent status", () => {
    const features: Feature[] = [
      { id: "f1", name: "Live", branches: ["feat/working"] },
      { id: "f2", name: "Awaiting", branches: ["feat/awaiting"] },
      { id: "f3", name: "Idle", branches: ["feat/done", "feat/none"] },
    ];
    const statusFor = (b: string) =>
      b === "feat/working"
        ? ("working" as const)
        : b === "feat/awaiting"
          ? ("awaitingInput" as const)
          : b === "feat/done"
            ? ("done" as const)
            : undefined;
    const { featureGroups } = buildBranchEntities({
      branches: [
        branch({ name: "feat/working" }),
        branch({ name: "feat/awaiting" }),
        branch({ name: "feat/done" }),
        branch({ name: "feat/none" }),
      ],
      worktrees: [],
      factory: factory({ features }),
      statusFor,
      isServerRunning: noServer,
    });
    const byId = new Map(featureGroups.map((g) => [g.feature.id, g]));
    // "working" and "awaitingInput" count as live; "done"/undefined do not.
    expect(byId.get("f1")!.hasActiveSession).toBe(true);
    expect(byId.get("f2")!.hasActiveSession).toBe(true);
    expect(byId.get("f3")!.hasActiveSession).toBe(false);
  });

  it("keeps a feature's branches in stored order even when activity order differs", () => {
    const features: Feature[] = [{ id: "f1", name: "Feature One", branches: ["feat/z", "feat/a"] }];
    const { featureGroups } = buildBranchEntities({
      branches: [branch({ name: "feat/z", lastCommitTs: 1 }), branch({ name: "feat/a", lastCommitTs: 999 })],
      worktrees: [],
      factory: factory({ features }),
      statusFor: noStatus,
      isServerRunning: noServer,
    });
    // feat/a has the more recent activity but stays SECOND — stored order wins.
    expect(featureGroups[0].branches.map((e) => e.name)).toEqual(["feat/z", "feat/a"]);
  });

  it("the unfiled Branches list stays activity-sorted (no manual reorder there)", () => {
    const { unfiled } = buildBranchEntities({
      branches: [branch({ name: "old", lastCommitTs: 1 }), branch({ name: "new", lastCommitTs: 999 })],
      worktrees: [],
      factory: factory(),
      statusFor: noStatus,
      isServerRunning: noServer,
    });
    expect(unfiled.map((e) => e.name)).toEqual(["new", "old"]);
  });

  it("ranks locally-present branches ahead of remote-only ones, each group ts-desc", () => {
    // localOld: local branch, older activity. remoteNew: remote-only, newer activity.
    // The local branch must still sort ABOVE the remote-only one despite the older ts.
    const { unfiled, all } = buildBranchEntities({
      branches: [
        branch({ name: "localOld", lastCommitTs: 1, remoteOnly: false }),
        branch({ name: "localNew", lastCommitTs: 100, remoteOnly: false }),
        branch({ name: "remoteNew", lastCommitTs: 9999, remoteOnly: true }),
        branch({ name: "remoteOld", lastCommitTs: 5, remoteOnly: true }),
      ],
      worktrees: [],
      factory: factory(),
      statusFor: noStatus,
      isServerRunning: noServer,
    });
    // Locals first (ts desc within), then remote-only (ts desc within).
    expect(unfiled.map((e) => e.name)).toEqual(["localNew", "localOld", "remoteNew", "remoteOld"]);
    expect(all.map((e) => e.name)).toEqual(["localNew", "localOld", "remoteNew", "remoteOld"]);
    // A locally-present branch with older activity still outranks a remote-only branch with newer.
    expect(unfiled.findIndex((e) => e.name === "localOld")).toBeLessThan(
      unfiled.findIndex((e) => e.name === "remoteNew"),
    );
  });

  it("populates title + displayName from factory.branchState[name].title", () => {
    const { all } = buildBranchEntities({
      branches: [branch({ name: "feat/xyz" }), branch({ name: "feat/plain" })],
      worktrees: [],
      factory: factory({
        branchState: {
          "feat/xyz": { createdAt: 1, title: "Nice Feature" },
          "feat/plain": { createdAt: 1 },
        },
      }),
      statusFor: noStatus,
      isServerRunning: noServer,
    });
    const titled = all.find((e) => e.name === "feat/xyz")!;
    expect(titled.title).toBe("Nice Feature");
    expect(titled.displayName).toBe("Nice Feature");
    // name stays the real git branch name (load-bearing for keys/openBranch/git ops).
    expect(titled.name).toBe("feat/xyz");

    const plain = all.find((e) => e.name === "feat/plain")!;
    expect(plain.title).toBeUndefined();
    expect(plain.displayName).toBe("feat/plain");
  });

  it("treats a whitespace-only stored title as no title (falls back to the branch name)", () => {
    const { all } = buildBranchEntities({
      branches: [branch({ name: "feat/ws" })],
      worktrees: [],
      factory: factory({ branchState: { "feat/ws": { createdAt: 1, title: "   " } } }),
      statusFor: noStatus,
      isServerRunning: noServer,
    });
    const e = all.find((x) => x.name === "feat/ws")!;
    expect(e.title).toBeUndefined();
    expect(e.displayName).toBe("feat/ws");
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
