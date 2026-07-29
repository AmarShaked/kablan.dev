import { describe, it, expect } from "vitest";
import { buildProjectEntities, filterEntities } from "./projectEntities.ts";
import type { Feature, Branch, Worktree } from "../api.ts";

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

describe("buildProjectEntities", () => {
  it("derives branch ts from lastCommitTs, defaulting null to 0", () => {
    const { branches } = buildProjectEntities({
      features: [],
      branches: [branch({ name: "a", lastCommitTs: 100 }), branch({ name: "b", lastCommitTs: null })],
      worktrees: [],
      workingTaskForceIds: new Set(),
    });
    expect(branches.find((b) => b.label === "a")!.ts).toBe(100);
    expect(branches.find((b) => b.label === "b")!.ts).toBe(0);
  });

  it("derives worktree ts from lastCommitTs, defaulting null to 0", () => {
    const { worktrees } = buildProjectEntities({
      features: [],
      branches: [],
      worktrees: [
        worktree({ path: "/wt/a", lastCommitTs: 50 }),
        worktree({ path: "/wt/b", lastCommitTs: null }),
      ],
      workingTaskForceIds: new Set(),
    });
    expect(worktrees.find((w) => w.worktreePath === "/wt/a")!.ts).toBe(50);
    expect(worktrees.find((w) => w.worktreePath === "/wt/b")!.ts).toBe(0);
  });

  it("derives taskForce ts as max(matching worktree lastCommitTs, createdAt)", () => {
    const features: Feature[] = [
      {
        id: "f1",
        name: "Feature One",
        taskForces: [
          { id: "t1", name: "TF One", branch: "feat/one", baseBranch: "main", worktreePath: "/wt/one", createdAt: 10 },
        ],
      },
    ];
    const worktrees: Worktree[] = [worktree({ path: "/wt/one", lastCommitTs: 500 })];
    const { taskForces } = buildProjectEntities({
      features,
      branches: [],
      worktrees,
      workingTaskForceIds: new Set(),
    });
    expect(taskForces.find((t) => t.id === "t1")!.ts).toBe(500);
  });

  it("uses createdAt when it exceeds the matching worktree's lastCommitTs", () => {
    const features: Feature[] = [
      {
        id: "f1",
        name: "Feature One",
        taskForces: [
          { id: "t1", name: "TF One", branch: "feat/one", baseBranch: "main", worktreePath: "/wt/one", createdAt: 900 },
        ],
      },
    ];
    const worktrees: Worktree[] = [worktree({ path: "/wt/one", lastCommitTs: 500 })];
    const { taskForces } = buildProjectEntities({
      features,
      branches: [],
      worktrees,
      workingTaskForceIds: new Set(),
    });
    expect(taskForces.find((t) => t.id === "t1")!.ts).toBe(900);
  });

  it("uses createdAt (and 0 for null lastCommitTs) when there's no matching worktree", () => {
    const features: Feature[] = [
      {
        id: "f1",
        name: "Feature One",
        taskForces: [
          { id: "t1", name: "TF One", branch: "feat/one", baseBranch: "main", worktreePath: "/no/match", createdAt: 42 },
        ],
      },
    ];
    const { taskForces } = buildProjectEntities({
      features,
      branches: [],
      worktrees: [],
      workingTaskForceIds: new Set(),
    });
    expect(taskForces.find((t) => t.id === "t1")!.ts).toBe(42);
  });

  it("floats a working task force's ts to Number.MAX_SAFE_INTEGER", () => {
    const features: Feature[] = [
      {
        id: "f1",
        name: "Feature One",
        taskForces: [
          { id: "t1", name: "TF One", branch: "feat/one", baseBranch: "main", worktreePath: "/wt/one", createdAt: 10 },
        ],
      },
    ];
    const worktrees: Worktree[] = [worktree({ path: "/wt/one", lastCommitTs: 500 })];
    const { taskForces } = buildProjectEntities({
      features,
      branches: [],
      worktrees,
      workingTaskForceIds: new Set(["t1"]),
    });
    expect(taskForces.find((t) => t.id === "t1")!.ts).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rolls up feature ts as the max of its task forces' ts, else 0", () => {
    const features: Feature[] = [
      {
        id: "f1",
        name: "Feature One",
        taskForces: [
          { id: "t1", name: "TF One", branch: "feat/one", baseBranch: "main", worktreePath: "/wt/one", createdAt: 10 },
          { id: "t2", name: "TF Two", branch: "feat/two", baseBranch: "main", worktreePath: "/wt/two", createdAt: 300 },
        ],
      },
      { id: "f2", name: "Feature Two (empty)", taskForces: [] },
    ];
    const { features: featureEntities } = buildProjectEntities({
      features,
      branches: [],
      worktrees: [],
      workingTaskForceIds: new Set(),
    });
    expect(featureEntities.find((f) => f.id === "f1")!.ts).toBe(300);
    expect(featureEntities.find((f) => f.id === "f2")!.ts).toBe(0);
  });

  it("sorts by ts desc, then by label asc as a stable tie-break", () => {
    const { branches } = buildProjectEntities({
      features: [],
      branches: [
        branch({ name: "zeta", lastCommitTs: 100 }),
        branch({ name: "alpha", lastCommitTs: 200 }),
        branch({ name: "beta", lastCommitTs: 200 }),
      ],
      worktrees: [],
      workingTaskForceIds: new Set(),
    });
    expect(branches.map((b) => b.label)).toEqual(["alpha", "beta", "zeta"]);
  });

  it("joins worktrees to task forces by path, setting taskForceId/featureId/status", () => {
    const features: Feature[] = [
      {
        id: "f1",
        name: "Feature One",
        taskForces: [
          { id: "t1", name: "TF One", branch: "feat/one", baseBranch: "main", worktreePath: "/wt/one", createdAt: 10 },
        ],
      },
    ];
    const worktrees: Worktree[] = [
      worktree({ path: "/wt/one", branch: "feat/one", lastCommitTs: 500, dirty: true }),
      worktree({ path: "/wt/unmatched", branch: "other", lastCommitTs: 10 }),
    ];
    const { worktrees: worktreeEntities } = buildProjectEntities({
      features,
      branches: [],
      worktrees,
      workingTaskForceIds: new Set(["t1"]),
    });
    const matched = worktreeEntities.find((w) => w.worktreePath === "/wt/one")!;
    expect(matched.taskForceId).toBe("t1");
    expect(matched.featureId).toBe("f1");
    expect(matched.status).toBe("working");
    expect(matched.dirty).toBe(true);
    expect(matched.branch).toBe("feat/one");

    const unmatched = worktreeEntities.find((w) => w.worktreePath === "/wt/unmatched")!;
    expect(unmatched.taskForceId).toBeUndefined();
    expect(unmatched.featureId).toBeUndefined();
    expect(unmatched.status).toBeUndefined();
  });

  it("leaves status undefined for a matched worktree whose task force isn't working", () => {
    const features: Feature[] = [
      {
        id: "f1",
        name: "Feature One",
        taskForces: [
          { id: "t1", name: "TF One", branch: "feat/one", baseBranch: "main", worktreePath: "/wt/one", createdAt: 10 },
        ],
      },
    ];
    const worktrees: Worktree[] = [worktree({ path: "/wt/one" })];
    const { worktrees: worktreeEntities } = buildProjectEntities({
      features,
      branches: [],
      worktrees,
      workingTaskForceIds: new Set(),
    });
    expect(worktreeEntities.find((w) => w.worktreePath === "/wt/one")!.status).toBeUndefined();
  });

  it("marks the current branch as isCurrent", () => {
    const { branches } = buildProjectEntities({
      features: [],
      branches: [branch({ name: "main", current: true }), branch({ name: "dev", current: false })],
      worktrees: [],
      workingTaskForceIds: new Set(),
    });
    expect(branches.find((b) => b.label === "main")!.isCurrent).toBe(true);
    expect(branches.find((b) => b.label === "dev")!.isCurrent).toBe(false);
  });
});

describe("filterEntities", () => {
  const list = buildProjectEntities({
    features: [],
    branches: [
      branch({ name: "feature/login", lastCommitTs: 100 }),
      branch({ name: "main", lastCommitTs: 50 }),
    ],
    worktrees: [],
    workingTaskForceIds: new Set(),
  }).branches;

  it("returns the list unchanged for an empty or whitespace query", () => {
    expect(filterEntities(list, "")).toEqual(list);
    expect(filterEntities(list, "   ")).toEqual(list);
  });

  it("filters case-insensitively by substring over label/sublabel/branch", () => {
    expect(filterEntities(list, "LOGIN").map((e) => e.label)).toEqual(["feature/login"]);
  });

  it("matches against sublabel and branch too", () => {
    const entities = [
      { kind: "worktree" as const, id: "w1", label: "wt-a", sublabel: "special-sub", branch: "b1", ts: 1 },
      { kind: "worktree" as const, id: "w2", label: "wt-b", sublabel: "other", branch: "matchme", ts: 2 },
      { kind: "worktree" as const, id: "w3", label: "wt-c", sublabel: "nope", branch: "nope2", ts: 3 },
    ];
    expect(filterEntities(entities, "special").map((e) => e.id)).toEqual(["w1"]);
    expect(filterEntities(entities, "matchme").map((e) => e.id)).toEqual(["w2"]);
  });
});
