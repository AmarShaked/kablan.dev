import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  startServer,
  initRepo,
  createBranch,
  checkout,
  addRemote,
  addRemoteBranch,
  pushBranch,
  git,
} from "./harness.ts";

describe("fetch + remote branches API", () => {
  test("local branches report remoteOnly:false", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      await createBranch(main, "feature");
      const { json } = await s.api.get("/api/projects/repo/branches");
      for (const b of json) assert.equal(b.remoteOnly, false);
    } finally {
      await s.stop();
    }
  });

  test("POST /fetch surfaces a branch that exists only on the remote", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const bare = join(s.workspace, "remote.git");
      await addRemote(main, bare);
      await addRemoteBranch(bare, "feature-x");

      // Before fetching, the new remote branch isn't known locally.
      let branches = (await s.api.get("/api/projects/repo/branches")).json;
      assert.ok(!branches.some((b: any) => b.name === "feature-x"), "not visible before fetch");

      const fetchRes = await s.api.post("/api/projects/repo/fetch", {});
      assert.equal(fetchRes.status, 200);
      assert.equal(typeof fetchRes.json.output, "string");

      // After fetching it appears as a remote-only branch.
      branches = (await s.api.get("/api/projects/repo/branches")).json;
      const fx = branches.find((b: any) => b.name === "feature-x");
      assert.ok(fx, "feature-x visible after fetch");
      assert.equal(fx.remoteOnly, true);
      assert.equal(fx.upstream, "origin/feature-x");
      assert.equal(fx.current, false);
    } finally {
      await s.stop();
    }
  });

  test("a remote-only branch can be checked out (creates a local tracking branch)", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const bare = join(s.workspace, "remote.git");
      await addRemote(main, bare);
      await addRemoteBranch(bare, "feature-y");
      await s.api.post("/api/projects/repo/fetch", {});

      const { status, json } = await s.api.post("/api/projects/repo/checkout", { branch: "feature-y" });
      assert.equal(status, 200);
      assert.equal(json.currentBranch, "feature-y");

      // Now it's a real local branch, no longer remote-only.
      const branches = (await s.api.get("/api/projects/repo/branches")).json;
      const fy = branches.find((b: any) => b.name === "feature-y");
      assert.ok(fy);
      assert.equal(fy.remoteOnly, false);
    } finally {
      await s.stop();
    }
  });

  test("POST /fetch on a repo with no remote succeeds (no-op)", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const { status } = await s.api.post("/api/projects/repo/fetch", {});
      assert.equal(status, 200);
    } finally {
      await s.stop();
    }
  });

  test("pull-branch reports 'Already up to date.' when aligned (non-checked-out)", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const bare = join(s.workspace, "remote.git");
      await addRemote(main, bare);
      await createBranch(main, "b");
      await checkout(main, "b");
      await pushBranch(main, "b");
      await checkout(main, "main"); // 'b' now not checked out, and aligned with origin

      const { status, json } = await s.api.post("/api/projects/repo/pull-branch", { branch: "b" });
      assert.equal(status, 200);
      assert.match(String(json.output), /up to date/i);
    } finally {
      await s.stop();
    }
  });
});
