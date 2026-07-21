import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { startServer, initRepo, commit, type TestServer } from "./harness.ts";

describe("projects API", () => {
  test("empty workspace returns []", async () => {
    const s = await startServer();
    try {
      const { status, json } = await s.api.get("/api/projects");
      assert.equal(status, 200);
      assert.deepEqual(json, []);
    } finally {
      await s.stop();
    }
  });

  test("two direct-child repos are both found with folder names and absolute paths", async () => {
    const s = await startServer();
    try {
      const alpha = join(s.workspace, "alpha");
      const beta = join(s.workspace, "beta");
      await initRepo(alpha);
      await initRepo(beta);

      const { status, json } = await s.api.get("/api/projects");
      assert.equal(status, 200);
      const names = json.map((p: any) => p.name).sort();
      assert.deepEqual(names, ["alpha", "beta"]);

      const byName = Object.fromEntries(json.map((p: any) => [p.name, p]));
      assert.equal(byName.alpha.path, alpha);
      assert.equal(byName.beta.path, beta);
      // path is absolute
      assert.ok(byName.alpha.path.startsWith("/"));
    } finally {
      await s.stop();
    }
  });

  test("nested repo acme/frontend is found with default maxScanDepth", async () => {
    const s = await startServer();
    try {
      const nested = join(s.workspace, "acme", "frontend");
      await initRepo(nested);

      const { status, json } = await s.api.get("/api/projects");
      assert.equal(status, 200);
      const names = json.map((p: any) => p.name);
      assert.deepEqual(names, ["acme/frontend"]);
      assert.equal(json[0].path, nested);
    } finally {
      await s.stop();
    }
  });

  test("maxScanDepth=1 excludes nested repo but finds a direct child", async () => {
    const s = await startServer({ config: { maxScanDepth: 1 } });
    try {
      const direct = join(s.workspace, "direct");
      const nested = join(s.workspace, "acme", "frontend");
      await initRepo(direct);
      await initRepo(nested);

      const { status, json } = await s.api.get("/api/projects");
      assert.equal(status, 200);
      const names = json.map((p: any) => p.name);
      assert.deepEqual(names, ["direct"]);
    } finally {
      await s.stop();
    }
  });

  test("repo under node_modules is not scanned", async () => {
    const s = await startServer();
    try {
      const visible = join(s.workspace, "visible");
      const hidden = join(s.workspace, "node_modules", "pkg");
      await initRepo(visible);
      await initRepo(hidden);

      const { status, json } = await s.api.get("/api/projects");
      assert.equal(status, 200);
      const names = json.map((p: any) => p.name);
      assert.deepEqual(names, ["visible"]);
    } finally {
      await s.stop();
    }
  });

  test("packageManager detection from lockfiles", async () => {
    const s = await startServer();
    try {
      const npmRepo = join(s.workspace, "npm-repo");
      const pnpmRepo = join(s.workspace, "pnpm-repo");
      const yarnRepo = join(s.workspace, "yarn-repo");
      const bunRepo = join(s.workspace, "bun-repo");
      await initRepo(npmRepo, { "README.md": "# npm\n" });
      await initRepo(pnpmRepo, { "pnpm-lock.yaml": "lockfileVersion: 9\n" });
      await initRepo(yarnRepo, { "yarn.lock": "# yarn lockfile\n" });
      await initRepo(bunRepo, { "bun.lockb": "binary" });

      const { status, json } = await s.api.get("/api/projects");
      assert.equal(status, 200);
      const byName = Object.fromEntries(json.map((p: any) => [p.name, p]));
      assert.equal(byName["npm-repo"].packageManager, "npm");
      assert.equal(byName["pnpm-repo"].packageManager, "pnpm");
      assert.equal(byName["yarn-repo"].packageManager, "yarn");
      assert.equal(byName["bun-repo"].packageManager, "bun");
    } finally {
      await s.stop();
    }
  });

  test("detectedCommand and devCommand from package.json scripts", async () => {
    const s = await startServer();
    try {
      const npmDev = join(s.workspace, "npm-dev");
      const pnpmDev = join(s.workspace, "pnpm-dev");
      const noScript = join(s.workspace, "no-script");
      await initRepo(npmDev, { "package.json": JSON.stringify({ scripts: { dev: "vite" } }) });
      await initRepo(pnpmDev, {
        "pnpm-lock.yaml": "lockfileVersion: 9\n",
        "package.json": JSON.stringify({ scripts: { dev: "vite" } }),
      });
      await initRepo(noScript, { "package.json": JSON.stringify({ scripts: { build: "tsc" } }) });

      const { status, json } = await s.api.get("/api/projects");
      assert.equal(status, 200);
      const byName = Object.fromEntries(json.map((p: any) => [p.name, p]));

      assert.equal(byName["npm-dev"].detectedCommand, "npm run dev");
      assert.equal(byName["npm-dev"].devCommand, "npm run dev");

      assert.equal(byName["pnpm-dev"].detectedCommand, "pnpm dev");
      assert.equal(byName["pnpm-dev"].devCommand, "pnpm dev");

      assert.equal(byName["no-script"].detectedCommand, null);
      assert.equal(byName["no-script"].devCommand, "npm run dev");
    } finally {
      await s.stop();
    }
  });

  test("hasEnv reflects presence of a .env file", async () => {
    const s = await startServer();
    try {
      const withEnv = join(s.workspace, "with-env");
      const withoutEnv = join(s.workspace, "without-env");
      await initRepo(withEnv, { ".env": "FOO=bar\n" });
      await initRepo(withoutEnv, { "README.md": "# none\n" });

      const { status, json } = await s.api.get("/api/projects");
      assert.equal(status, 200);
      const byName = Object.fromEntries(json.map((p: any) => [p.name, p]));
      assert.equal(byName["with-env"].hasEnv, true);
      assert.equal(byName["without-env"].hasEnv, false);
    } finally {
      await s.stop();
    }
  });

  test("showNonNodeProjects=false excludes repos without package.json", async () => {
    const s = await startServer({ config: { showNonNodeProjects: false } });
    try {
      const nodeRepo = join(s.workspace, "node-repo");
      const plainRepo = join(s.workspace, "plain-repo");
      await initRepo(nodeRepo, { "package.json": JSON.stringify({ scripts: { dev: "vite" } }) });
      await initRepo(plainRepo, { "README.md": "# plain\n" });

      const { status, json } = await s.api.get("/api/projects");
      assert.equal(status, 200);
      const names = json.map((p: any) => p.name);
      assert.deepEqual(names, ["node-repo"]);
    } finally {
      await s.stop();
    }
  });

  test("results are sorted most-recent-commit first", async () => {
    const s = await startServer();
    try {
      const oldRepo = join(s.workspace, "old-repo");
      const midRepo = join(s.workspace, "mid-repo");
      const newRepo = join(s.workspace, "new-repo");
      await initRepo(oldRepo);
      await initRepo(midRepo);
      await initRepo(newRepo);
      await commit(oldRepo, "old", { "f.txt": "x" }, "2021-01-01T00:00:00");
      await commit(midRepo, "mid", { "f.txt": "x" }, "2022-06-15T00:00:00");
      await commit(newRepo, "new", { "f.txt": "x" }, "2023-12-31T00:00:00");

      const { status, json } = await s.api.get("/api/projects");
      assert.equal(status, 200);
      const names = json.map((p: any) => p.name);
      assert.deepEqual(names, ["new-repo", "mid-repo", "old-repo"]);
    } finally {
      await s.stop();
    }
  });

  test("no servers running: /api/servers is [] and per-project server is null", async () => {
    const s = await startServer();
    try {
      const repo = join(s.workspace, "solo");
      await initRepo(repo);

      const servers = await s.api.get("/api/servers");
      assert.equal(servers.status, 200);
      assert.deepEqual(servers.json, []);

      const perProject = await s.api.get("/api/projects/solo/server");
      assert.equal(perProject.status, 200);
      assert.equal(perProject.json, null);
    } finally {
      await s.stop();
    }
  });
});
