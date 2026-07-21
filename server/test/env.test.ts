import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { startServer, initRepo, addWorktree, type TestServer } from "./harness.ts";

const DEFAULT_ENV_ORDER = [".env", ".env.local", ".env.development", ".env.development.local"];

describe("env-file API", () => {
  let s: TestServer;
  const name = "envrepo";
  let repo: string;

  before(async () => {
    s = await startServer();
    repo = join(s.workspace, name);
    await initRepo(repo);
  });
  after(async () => {
    await s.stop();
  });

  test("GET env on a fresh repo returns 4 entries, none existing, in default order", async () => {
    const { status, json } = await s.api.get(`/api/projects/${name}/env`);
    assert.equal(status, 200);
    assert.ok(Array.isArray(json));
    assert.deepEqual(json.map((e: any) => e.name), DEFAULT_ENV_ORDER);
    for (const e of json) {
      assert.equal(e.exists, false);
      assert.equal(e.content, "");
    }
  });

  test("GET env reflects an existing .env file", async () => {
    writeFileSync(join(repo, ".env"), "A=1\n");
    const { status, json } = await s.api.get(`/api/projects/${name}/env`);
    assert.equal(status, 200);
    const dotenv = json.find((e: any) => e.name === ".env");
    assert.equal(dotenv.exists, true);
    assert.equal(dotenv.content, "A=1\n");
    for (const e of json) {
      if (e.name !== ".env") {
        assert.equal(e.exists, false, `${e.name} should not exist`);
        assert.equal(e.content, "");
      }
    }
  });

  test("PUT env writes .env.local and GET reflects it", async () => {
    const put = await s.api.put(`/api/projects/${name}/env`, {
      name: ".env.local",
      content: "B=2\n",
    });
    assert.equal(put.status, 200);
    assert.deepEqual(put.json, { ok: true });

    const { json } = await s.api.get(`/api/projects/${name}/env`);
    const local = json.find((e: any) => e.name === ".env.local");
    assert.equal(local.exists, true);
    assert.equal(local.content, "B=2\n");
  });

  test("PUT env with an unknown filename is rejected with 400", async () => {
    const { status } = await s.api.put(`/api/projects/${name}/env`, {
      name: "secrets.env",
      content: "X=1\n",
    });
    assert.equal(status, 400);
  });

  test("PUT env with missing content is 400, and missing name is 400", async () => {
    const noContent = await s.api.put(`/api/projects/${name}/env`, { name: ".env" });
    assert.equal(noContent.status, 400);
    const noName = await s.api.put(`/api/projects/${name}/env`, { content: "C=3\n" });
    assert.equal(noName.status, 400);
  });
});

describe("env-file API worktree isolation", () => {
  let s: TestServer;
  const name = "wtrepo";
  let main: string;
  let wtPath: string;

  before(async () => {
    s = await startServer();
    main = join(s.workspace, name);
    await initRepo(main);
    await addWorktree(main, join(s.workspace, "wtrepo-feature"), "feature");
    // git resolves symlinks in worktree paths (e.g. macOS /var -> /private/var),
    // and the server matches cwd against git's reported paths, so use the canonical form.
    wtPath = realpathSync(join(s.workspace, "wtrepo-feature"));
  });
  after(async () => {
    await s.stop();
  });

  test("env in a worktree is isolated from the main repo", async () => {
    writeFileSync(join(main, ".env"), "MAIN=1\n");

    const put = await s.api.put(`/api/projects/${name}/env`, {
      name: ".env",
      content: "WT=1\n",
      cwd: wtPath,
    });
    assert.equal(put.status, 200);
    assert.deepEqual(put.json, { ok: true });

    const wt = await s.api.get(`/api/projects/${name}/env?cwd=${encodeURIComponent(wtPath)}`);
    assert.equal(wt.status, 200);
    assert.equal(wt.json.find((e: any) => e.name === ".env").content, "WT=1\n");

    const mainEnv = await s.api.get(`/api/projects/${name}/env`);
    assert.equal(mainEnv.status, 200);
    assert.equal(mainEnv.json.find((e: any) => e.name === ".env").content, "MAIN=1\n");
  });

  test("GET env with a bogus cwd is rejected with 400", async () => {
    const { status } = await s.api.get(
      `/api/projects/${name}/env?cwd=${encodeURIComponent("/tmp/not-a-worktree")}`,
    );
    assert.equal(status, 400);
  });
});

describe("dev-command override API", () => {
  let s: TestServer;
  const name = "cmdrepo";
  let repo: string;

  before(async () => {
    s = await startServer();
    repo = join(s.workspace, name);
    await initRepo(repo);
  });
  after(async () => {
    await s.stop();
  });

  test("PUT command sets an override reflected by GET /api/projects", async () => {
    const put = await s.api.put(`/api/projects/${name}/command`, { devCommand: "make dev" });
    assert.equal(put.status, 200);
    assert.deepEqual(put.json, { devCommand: "make dev" });

    const projects = await s.api.get("/api/projects");
    assert.equal(projects.status, 200);
    const proj = projects.json.find((p: any) => p.name === name);
    assert.ok(proj, "project should be listed");
    assert.equal(proj.devCommand, "make dev");
  });

  test("PUT command with whitespace clears the override", async () => {
    const put = await s.api.put(`/api/projects/${name}/command`, { devCommand: "  " });
    assert.equal(put.status, 200);
    // No package.json dev script, so resolution falls back to "npm run dev".
    assert.notEqual(put.json.devCommand, "make dev");
    assert.equal(put.json.devCommand, "npm run dev");
  });

  test("DELETE /api/config/overrides/:name clears the override", async () => {
    // Set an override first.
    await s.api.put(`/api/projects/${name}/command`, { devCommand: "make dev" });
    const before = await s.api.get("/api/config");
    const key = Object.keys(before.json.overrides).find((k) => k.endsWith(name));
    assert.ok(key, "override key should be present after setting");

    const del = await s.api.del(`/api/config/overrides/${name}`);
    assert.equal(del.status, 200);
    assert.ok(!Object.prototype.hasOwnProperty.call(del.json.overrides, key), "override should be gone");
  });

  test("DELETE overrides with a traversing name is rejected with 400", async () => {
    // A pure ".." segment gets collapsed by URL path normalization before it
    // reaches the server; encode the slash so the whole segment survives as a
    // single param that decodes to a traversing "../escape" the server rejects.
    const { status } = await s.api.del(`/api/config/overrides/..%2Fescape`);
    assert.equal(status, 400);
  });
});
