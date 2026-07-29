import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { startServer, initRepo, createBranch, type TestServer } from "./harness.ts";

// A benign, long-lived dev "server": prints a marker then idles.
const UP = "MARKER_UP";
const RUN_CMD = `node -e "console.log('${UP}'); setInterval(()=>{}, 1000)"`;
const IDLE_CMD = `node -e "setInterval(()=>{}, 1000)"`;

async function waitFor(fn: () => Promise<boolean>, ms = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timed out waiting for condition");
}

describe("server lifecycle API", () => {
  test("start → running with pid, logs capture the command echo + stdout", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const { status, json } = await s.api.post("/api/projects/repo/server/start", { command: RUN_CMD });
      assert.equal(status, 200);
      assert.equal(json.projectName, "repo");
      assert.equal(json.cwd, main);
      assert.equal(json.command, RUN_CMD);
      assert.equal(json.branch, null);
      assert.equal(typeof json.pid, "number");
      assert.ok(["starting", "running"].includes(json.status));
      assert.equal(typeof json.startedAt, "number");

      // Logs eventually include the process's stdout marker (the command echo also
      // contains the marker text, so match specifically on a stdout line).
      await waitFor(async () => {
        const logs = (await s.api.get("/api/projects/repo/logs")).json;
        return Array.isArray(logs) && logs.some((l: any) => l.stream === "stdout" && l.text.includes(UP));
      });
      const logs = (await s.api.get("/api/projects/repo/logs")).json;
      assert.ok(logs.some((l: any) => l.stream === "system" && l.text.includes(RUN_CMD)));
      assert.ok(logs.some((l: any) => l.stream === "stdout" && l.text.includes(UP)));

      // Reflected in the single-server and all-servers views.
      const one = (await s.api.get("/api/projects/repo/server")).json;
      assert.equal(one.command, RUN_CMD);
      const all = (await s.api.get("/api/servers")).json;
      assert.equal(all.length, 1);
      assert.equal(all[0].projectName, "repo");
    } finally {
      await s.api.post("/api/projects/repo/server/stop", {}).catch(() => {});
      await s.stop();
    }
  });

  test("starting again in the SAME cwd replaces the previous server", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      await s.api.post("/api/projects/repo/server/start", { command: IDLE_CMD });
      const first = (await s.api.get("/api/projects/repo/server")).json;
      await s.api.post("/api/projects/repo/server/start", { command: RUN_CMD });
      const second = (await s.api.get("/api/projects/repo/server")).json;
      assert.equal(second.command, RUN_CMD);
      assert.notEqual(second.startedAt < first.startedAt, true);
      const all = (await s.api.get("/api/servers")).json;
      assert.equal(all.length, 1, "same cwd → still a single server");
    } finally {
      await s.api.post("/api/projects/repo/server/stop", {}).catch(() => {});
      await s.stop();
    }
  });

  test("servers in two different cwds run concurrently and both list in /api/servers", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      // A second working copy (a branch's worktree, modelled here as a plain dir).
      const other = join(s.workspace, "repo-wt");
      mkdirSync(other, { recursive: true });

      // First server: no cwd → defaults to the project's main path (backward-compat).
      await s.api.post("/api/projects/repo/server/start", { command: IDLE_CMD });
      // Second server: an explicit, different cwd.
      await s.api.post("/api/projects/repo/server/start", { command: IDLE_CMD, cwd: other });

      await waitFor(async () => (await s.api.get("/api/servers")).json?.length === 2);
      const all = (await s.api.get("/api/servers")).json;
      assert.equal(all.length, 2, "both working copies run at once");
      const cwds = all.map((x: any) => x.cwd).sort();
      assert.deepEqual(cwds, [main, other].sort());
      assert.ok(
        all.every((x: any) => x.status === "running" || x.status === "starting"),
        "both are live",
      );
      assert.ok(all.every((x: any) => x.projectName === "repo"));

      // Single-view with no cwd returns the MAIN-path server (backward-compat).
      const mainView = (await s.api.get("/api/projects/repo/server")).json;
      assert.equal(mainView.cwd, main);
      // Single-view with an explicit ?cwd returns the server at that working copy.
      const otherView = (await s.api.get(`/api/projects/repo/server?cwd=${encodeURIComponent(other)}`)).json;
      assert.equal(otherView.cwd, other);
    } finally {
      await s.api.post("/api/projects/repo/server/stop", {}).catch(() => {});
      await s.api.post("/api/projects/repo/server/stop", { cwd: join(s.workspace, "repo-wt") }).catch(() => {});
      await s.stop();
    }
  });

  test("stop targets the server at the given cwd, leaving others running", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const other = join(s.workspace, "repo-wt2");
      mkdirSync(other, { recursive: true });
      await s.api.post("/api/projects/repo/server/start", { command: IDLE_CMD });
      await s.api.post("/api/projects/repo/server/start", { command: IDLE_CMD, cwd: other });
      await waitFor(async () => (await s.api.get("/api/servers")).json?.length === 2);

      // Stop only the "other" cwd; the main-path server keeps running.
      const { json } = await s.api.post("/api/projects/repo/server/stop", { cwd: other });
      assert.equal(json.stopped, true);
      await waitFor(async () => {
        const st = (await s.api.get(`/api/projects/repo/server?cwd=${encodeURIComponent(other)}`)).json?.status;
        return st !== "running" && st !== "starting";
      });
      const mainView = (await s.api.get("/api/projects/repo/server")).json;
      assert.ok(["running", "starting"].includes(mainView.status), "main server untouched");
    } finally {
      await s.api.post("/api/projects/repo/server/stop", {}).catch(() => {});
      await s.stop();
    }
  });

  test("stop returns {stopped:true} and the server is no longer running", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      await s.api.post("/api/projects/repo/server/start", { command: IDLE_CMD });
      await waitFor(async () => (await s.api.get("/api/projects/repo/server")).json?.status === "running");
      const { status, json } = await s.api.post("/api/projects/repo/server/stop", {});
      assert.equal(status, 200);
      assert.equal(json.stopped, true);
      await waitFor(async () => {
        const st = (await s.api.get("/api/projects/repo/server")).json?.status;
        return st !== "running" && st !== "starting";
      });
    } finally {
      await s.stop();
    }
  });

  test("stopping when nothing runs returns {stopped:false}", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const { status, json } = await s.api.post("/api/projects/repo/server/stop", {});
      assert.equal(status, 200);
      assert.equal(json.stopped, false);
    } finally {
      await s.stop();
    }
  });

  test("start with a non-existent cwd → 400", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      const { status, json } = await s.api.post("/api/projects/repo/server/start", {
        cwd: join(s.workspace, "does-not-exist"),
        command: IDLE_CMD,
      });
      assert.equal(status, 400);
      assert.match(String(json.error), /does not exist/i);
    } finally {
      await s.stop();
    }
  });

  test("start with a branch checks it out first", async () => {
    const s = await startServer();
    try {
      const main = join(s.workspace, "repo");
      await initRepo(main);
      await createBranch(main, "feature");
      const { status, json } = await s.api.post("/api/projects/repo/server/start", {
        branch: "feature",
        command: IDLE_CMD,
      });
      assert.equal(status, 200);
      assert.equal(json.branch, "feature");
      const proj = (await s.api.get("/api/projects")).json.find((p: any) => p.name === "repo");
      assert.equal(proj.currentBranch, "feature");
    } finally {
      await s.api.post("/api/projects/repo/server/stop", {}).catch(() => {});
      await s.stop();
    }
  });
});
