import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  startServer,
  initRepo,
  createBranch,
  checkout,
  addRemote,
  advanceRemote,
  pushBranch,
  git,
} from "./harness.ts";

describe("checkout API", () => {
  test("switches branch and returns the new current branch", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      await createBranch(main, "feature");
      const { status, json } = await s.api.post("/api/projects/repo/checkout", { branch: "feature" });
      assert.equal(status, 200);
      assert.equal(json.currentBranch, "feature");
    } finally {
      await s.stop();
    }
  });

  test("missing branch → 400", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const { status, json } = await s.api.post("/api/projects/repo/checkout", {});
      assert.equal(status, 400);
      assert.match(String(json.error), /branch is required/i);
    } finally {
      await s.stop();
    }
  });

  test("nonexistent branch → 400 with git's message", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const { status, json } = await s.api.post("/api/projects/repo/checkout", { branch: "ghost" });
      assert.equal(status, 400);
      assert.ok(json.error, "error message present");
    } finally {
      await s.stop();
    }
  });
});

describe("pull API", () => {
  test("up-to-date repo returns 'Already up to date.'", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      await addRemote(main, join(s.workspace, "remote.git"));
      const { status, json } = await s.api.post("/api/projects/repo/pull", {});
      assert.equal(status, 200);
      assert.equal(json.currentBranch, "main");
      assert.match(String(json.output), /up to date/i);
    } finally {
      await s.stop();
    }
  });

  test("fast-forwards when the remote is ahead", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const bare = join(s.workspace, "remote.git");
      await addRemote(main, bare);
      await advanceRemote(bare, "main");
      const { status, json } = await s.api.post("/api/projects/repo/pull", {});
      assert.equal(status, 200);
      assert.equal(json.currentBranch, "main");
      assert.equal(typeof json.output, "string");
      assert.ok(json.output.length > 0);
      // The remote commit is now present locally.
      const log = await git(main, ["log", "--oneline"]);
      assert.match(log, /remote commit/);
    } finally {
      await s.stop();
    }
  });
});

describe("pull-branch API", () => {
  test("missing branch → 400", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const { status } = await s.api.post("/api/projects/repo/pull-branch", {});
      assert.equal(status, 400);
    } finally {
      await s.stop();
    }
  });

  test("pulls the currently checked-out branch (plain pull path)", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const bare = join(s.workspace, "remote.git");
      await addRemote(main, bare);
      await advanceRemote(bare, "main");
      const { status, json } = await s.api.post("/api/projects/repo/pull-branch", { branch: "main" });
      assert.equal(status, 200);
      assert.ok(String(json.output).length > 0);
    } finally {
      await s.stop();
    }
  });

  test("fast-forwards a non-checked-out branch from its upstream", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const bare = join(s.workspace, "remote.git");
      await addRemote(main, bare);
      await createBranch(main, "feature");
      await checkout(main, "feature");
      await pushBranch(main, "feature");
      await checkout(main, "main"); // feature is now NOT checked out
      await advanceRemote(bare, "feature"); // remote feature moves ahead

      const before = await git(main, ["rev-parse", "feature"]);
      const { status, json } = await s.api.post("/api/projects/repo/pull-branch", { branch: "feature" });
      assert.equal(status, 200);
      assert.ok(String(json.output).length > 0);
      const after = await git(main, ["rev-parse", "feature"]);
      assert.notEqual(before, after, "local feature ref advanced");
    } finally {
      await s.stop();
    }
  });

  test("branch with no upstream → 400", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main); // no remote at all
      await createBranch(main, "local"); // not checked out, no upstream
      const { status, json } = await s.api.post("/api/projects/repo/pull-branch", { branch: "local" });
      assert.equal(status, 400);
      assert.match(String(json.error), /upstream/i);
    } finally {
      await s.stop();
    }
  });
});
