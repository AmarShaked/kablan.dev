import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { startServer, initRepo, commit, createBranch, checkout, addWorktree, git } from "./harness.ts";

describe("worktree dirty state", () => {
  test("reports uncommitted changes per worktree", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      let wts = (await s.api.get("/api/projects/repo/worktrees")).json;
      assert.equal(wts.find((w: any) => w.isMain).dirty, false, "clean repo -> not dirty");

      // Modify a tracked file in the main worktree.
      writeFileSync(join(main, "README.md"), "# changed\n");
      wts = (await s.api.get("/api/projects/repo/worktrees")).json;
      assert.equal(wts.find((w: any) => w.isMain).dirty, true, "modified repo -> dirty");

      // A fresh linked worktree is clean, then dirty after a change.
      const wt = join(s.workspace, "wt");
      await addWorktree(main, wt, "feature");
      wts = (await s.api.get("/api/projects/repo/worktrees")).json;
      assert.equal(wts.find((w: any) => w.path === wt).dirty, false);
      writeFileSync(join(wt, "new-file.txt"), "x");
      wts = (await s.api.get("/api/projects/repo/worktrees")).json;
      assert.equal(wts.find((w: any) => w.path === wt).dirty, true);
    } finally {
      await s.stop();
    }
  });
});

describe("commit log API", () => {
  test("returns recent commits with fields, order, and parent counts", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main); // commit 1 (root)
      await commit(main, "second", { "a.txt": "1" });
      await commit(main, "third", { "b.txt": "1" });

      const { status, json } = await s.api.get("/api/projects/repo/log");
      assert.equal(status, 200);
      assert.equal(json.commits.length, 3);
      const top = json.commits[0];
      assert.match(top.sha, /^[0-9a-f]{40}$/);
      assert.match(top.shortSha, /^[0-9a-f]{7,}$/);
      assert.equal(top.subject, "third");
      assert.equal(top.author, "Test User");
      assert.equal(typeof top.ts, "number");
      assert.equal(top.parents, 1);
      // The root commit has no parents.
      assert.equal(json.commits[json.commits.length - 1].parents, 0);
    } finally {
      await s.stop();
    }
  });

  test("honors the limit param and detects merge commits (2 parents)", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      await createBranch(main, "feature");
      await checkout(main, "feature");
      await commit(main, "feature work", { "f.txt": "1" });
      await checkout(main, "main");
      await commit(main, "main work", { "m.txt": "1" });
      await git(main, ["merge", "--no-ff", "feature", "-m", "merge feature"]);

      const { json } = await s.api.get("/api/projects/repo/log?limit=2");
      assert.equal(json.commits.length, 2);
      assert.equal(json.commits[0].subject, "merge feature");
      assert.equal(json.commits[0].parents, 2, "merge commit has two parents");
    } finally {
      await s.stop();
    }
  });
});

describe("diff API", () => {
  test("working-tree diff shows uncommitted changes to tracked files", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main, { "README.md": "# repo\n" });
      writeFileSync(join(main, "README.md"), "# repo\nnew line here\n");

      const { status, json } = await s.api.get("/api/projects/repo/diff");
      assert.equal(status, 200);
      assert.match(json.diff, /README\.md/);
      assert.match(json.diff, /new line here/);
    } finally {
      await s.stop();
    }
  });

  test("clean working tree returns an empty diff", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const { json } = await s.api.get("/api/projects/repo/diff");
      assert.equal(json.diff, "");
    } finally {
      await s.stop();
    }
  });

  test("diff of a specific commit (sha) shows that commit's changes", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      await commit(main, "add feature file", { "feature.txt": "hello world\n" });
      const sha = (await s.api.get("/api/projects/repo/log")).json.commits[0].sha;

      const { json } = await s.api.get(`/api/projects/repo/diff?sha=${sha}`);
      assert.match(json.diff, /feature\.txt/);
      assert.match(json.diff, /hello world/);
    } finally {
      await s.stop();
    }
  });
});
