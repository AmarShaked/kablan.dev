import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import {
  startServer,
  initRepo,
  commit,
  createBranch,
  checkout,
  addRemote,
  advanceRemote,
  addWorktree,
  git,
} from "./harness.ts";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** Like initRepo but with a specific initial-commit date (for window tests). */
async function initRepoDated(dir: string, date: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  await git(dir, ["init"]);
  await git(dir, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  await git(dir, ["config", "user.email", "test@example.com"]);
  await git(dir, ["config", "user.name", "Test User"]);
  await git(dir, ["config", "commit.gpgsign", "false"]);
  await commit(dir, "initial commit", { "README.md": "# repo\n" }, date);
}

describe("branches API", () => {
  test("lists branches with fields, current flag, and committerdate-desc order", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main, { "README.md": "# repo\n" });
      // main tip is older; feature tip is newer.
      await commit(main, "main work", { "a.txt": "1" }, daysAgo(10));
      await createBranch(main, "feature");
      await checkout(main, "feature");
      await commit(main, "feature work", { "b.txt": "1" }, daysAgo(2));
      await checkout(main, "main");

      const { status, json } = await s.api.get("/api/projects/repo/branches");
      assert.equal(status, 200);
      assert.ok(Array.isArray(json));
      const names = json.map((b: any) => b.name);
      assert.deepEqual([...names].sort(), ["feature", "main"]);
      // Newest committerdate first → feature before main.
      assert.deepEqual(names, ["feature", "main"]);

      const mainB = json.find((b: any) => b.name === "main");
      assert.equal(mainB.current, true);
      assert.equal(json.find((b: any) => b.name === "feature").current, false);
      assert.match(mainB.lastCommit, /^[0-9a-f]{7,40}$/);
      assert.equal(typeof mainB.lastCommitTs, "number");
      assert.equal(mainB.author, "Test User");
      assert.equal(mainB.upstream, null);
      assert.equal(mainB.ahead, 0);
      assert.equal(mainB.behind, 0);
      assert.equal(typeof mainB.lastCommitDate, "string");
    } finally {
      await s.stop();
    }
  });

  test("reports upstream + behind after remote advances and a fetch", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const bare = join(s.workspace, "remote.git");
      await addRemote(main, bare); // pushes main, sets upstream origin/main
      await advanceRemote(bare, "main"); // remote gets 1 extra commit
      await git(main, ["fetch"]); // user-side fetch makes "behind" visible

      const { json } = await s.api.get("/api/projects/repo/branches");
      const mainB = json.find((b: any) => b.name === "main");
      assert.equal(mainB.upstream, "origin/main");
      assert.equal(mainB.behind, 1);
      assert.equal(mainB.ahead, 0);
    } finally {
      await s.stop();
    }
  });

  test("reports ahead when local has unpushed commits", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const bare = join(s.workspace, "remote.git");
      await addRemote(main, bare);
      await commit(main, "local only", { "c.txt": "1" }); // not pushed

      const { json } = await s.api.get("/api/projects/repo/branches");
      const mainB = json.find((b: any) => b.name === "main");
      assert.equal(mainB.upstream, "origin/main");
      assert.equal(mainB.ahead, 1);
      assert.equal(mainB.behind, 0);
    } finally {
      await s.stop();
    }
  });
});

describe("worktrees API", () => {
  test("returns the main worktree with isMain + branch + metadata", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const { status, json } = await s.api.get("/api/projects/repo/worktrees");
      assert.equal(status, 200);
      assert.equal(json.length, 1);
      const w = json[0];
      assert.equal(w.isMain, true);
      assert.equal(w.branch, "main");
      assert.equal(w.bare, false);
      assert.equal(w.detached, false);
      assert.equal(w.locked, false);
      assert.match(w.head, /^[0-9a-f]{7,8}$/);
      assert.equal(w.author, "Test User");
      assert.equal(typeof w.lastCommitTs, "number");
    } finally {
      await s.stop();
    }
  });

  test("lists a linked worktree and a detached worktree", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const wt = join(s.workspace, "wt-feature");
      await addWorktree(main, wt, "feature"); // new branch
      const wtDetached = join(s.workspace, "wt-detached");
      await git(main, ["worktree", "add", "--detach", wtDetached]);

      const { json } = await s.api.get("/api/projects/repo/worktrees");
      assert.equal(json.length, 3);
      const feature = json.find((w: any) => w.path === wt);
      assert.equal(feature.isMain, false);
      assert.equal(feature.branch, "feature");
      const det = json.find((w: any) => w.path === wtDetached);
      assert.equal(det.detached, true);
      assert.equal(det.branch, null);
    } finally {
      await s.stop();
    }
  });

  test("prunes worktrees whose directory no longer exists", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const wt = join(s.workspace, "wt-gone");
      await addWorktree(main, wt, "feature");
      rmSync(wt, { recursive: true, force: true }); // stale worktree entry

      const { json } = await s.api.get("/api/projects/repo/worktrees");
      assert.ok(!json.some((w: any) => w.path === wt), "stale worktree is dropped");
      assert.ok(json.some((w: any) => w.isMain));
    } finally {
      await s.stop();
    }
  });
});

describe("commit-activity API", () => {
  test("HEAD activity counts commits in the last 6 months and excludes older ones", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      // Linear, monotonically-increasing dates (as real history is): the oldest
      // commit is the root and falls outside the 6-month window, so it's excluded.
      await initRepoDated(main, daysAgo(400));
      await commit(main, "recent1", { "r1.txt": "1" }, daysAgo(5));
      await commit(main, "recent2", { "r2.txt": "1" }, daysAgo(1));

      const { status, json } = await s.api.get("/api/projects/repo/commits");
      assert.equal(status, 200);
      assert.ok(Array.isArray(json.timestamps));
      // Only the two recent commits are within the window; the 400-day-old root is excluded.
      assert.equal(json.timestamps.length, 2);
      json.timestamps.forEach((t: number) => assert.equal(typeof t, "number"));
    } finally {
      await s.stop();
    }
  });

  test("feature ref returns only commits since it forked from the default branch", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      await commit(main, "main2", { "m2.txt": "1" }, daysAgo(9));
      await createBranch(main, "feature");
      await checkout(main, "feature");
      await commit(main, "feat1", { "f1.txt": "1" }, daysAgo(3));
      await commit(main, "feat2", { "f2.txt": "1" }, daysAgo(2));
      await checkout(main, "main");
      // main advances after the fork — must NOT be counted for feature.
      await commit(main, "main3", { "m3.txt": "1" }, daysAgo(1));

      const { json } = await s.api.get("/api/projects/repo/commits?ref=feature");
      assert.equal(json.timestamps.length, 2, "only the two feature commits");
    } finally {
      await s.stop();
    }
  });

  test("ref equal to the default branch returns full (windowed) history, not a fork range", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      await commit(main, "m2", { "m2.txt": "1" }, daysAgo(4));
      const { json } = await s.api.get("/api/projects/repo/commits?ref=main");
      assert.equal(json.timestamps.length, 2);
    } finally {
      await s.stop();
    }
  });

  test("cwd resolves a worktree's HEAD", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const wt = join(s.workspace, "wt");
      await addWorktree(main, wt, "feature");
      await commit(wt, "in worktree", { "w.txt": "1" }, daysAgo(1));
      const { status, json } = await s.api.get(
        `/api/projects/repo/commits?cwd=${encodeURIComponent(wt)}`,
      );
      assert.equal(status, 200);
      assert.ok(json.timestamps.length >= 1);
    } finally {
      await s.stop();
    }
  });
});
