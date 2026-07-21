import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { startServer, type TestServer } from "./harness.ts";

describe("config API", () => {
  let s: TestServer;
  before(async () => {
    s = await startServer();
  });
  after(async () => {
    await s.stop();
  });

  test("GET /api/config returns the effective config", async () => {
    const { status, json } = await s.api.get("/api/config");
    assert.equal(status, 200);
    assert.equal(json.parentDir, s.workspace);
    assert.equal(json.maxScanDepth, 3);
    assert.deepEqual(json.envFiles, [".env", ".env.local", ".env.development", ".env.development.local"]);
    assert.deepEqual(json.devScriptPriority, ["dev", "start", "serve", "develop"]);
    assert.equal(json.maxLogLines, 2000);
    assert.equal(json.showNonNodeProjects, true);
    assert.equal(json.linearWorkspace, "");
    assert.deepEqual(json.overrides, {});
  });

  test("GET /api/config/defaults returns defaults (parentDir is the home default, not the temp workspace)", async () => {
    const { status, json } = await s.api.get("/api/config/defaults");
    assert.equal(status, 200);
    assert.equal(json.maxScanDepth, 3);
    assert.notEqual(json.parentDir, s.workspace);
  });

  test("PUT /api/config saves recognised fields", async () => {
    const { status, json } = await s.api.put("/api/config", {
      maxScanDepth: 5,
      maxLogLines: 500,
      showNonNodeProjects: false,
      linearWorkspace: "  acme  ",
      envFiles: [" .env ", "", ".env.prod"],
      devScriptPriority: ["dev", " ", "start"],
    });
    assert.equal(status, 200);
    assert.equal(json.maxScanDepth, 5);
    assert.equal(json.maxLogLines, 500);
    assert.equal(json.showNonNodeProjects, false);
    assert.equal(json.linearWorkspace, "acme", "linearWorkspace is trimmed");
    assert.deepEqual(json.envFiles, [".env", ".env.prod"], "env files trimmed + empties dropped");
    assert.deepEqual(json.devScriptPriority, ["dev", "start"]);
  });

  test("PUT /api/config clamps maxScanDepth to [1,8] and floors it", async () => {
    let r = await s.api.put("/api/config", { maxScanDepth: 99 });
    assert.equal(r.json.maxScanDepth, 8);
    r = await s.api.put("/api/config", { maxScanDepth: 2.9 });
    assert.equal(r.json.maxScanDepth, 2);
    // Values below 1 are rejected (field ignored), leaving the previous value.
    r = await s.api.put("/api/config", { maxScanDepth: 0 });
    assert.equal(r.json.maxScanDepth, 2);
  });

  test("PUT /api/config ignores wrong-typed fields", async () => {
    const before = (await s.api.get("/api/config")).json;
    const { json } = await s.api.put("/api/config", {
      maxLogLines: "lots",
      showNonNodeProjects: "yes",
      envFiles: "nope",
    });
    assert.equal(json.maxLogLines, before.maxLogLines);
    assert.equal(json.showNonNodeProjects, before.showNonNodeProjects);
    assert.deepEqual(json.envFiles, before.envFiles);
  });

  test("PUT /api/config rejects maxLogLines <= 0", async () => {
    const before = (await s.api.get("/api/config")).json;
    const { json } = await s.api.put("/api/config", { maxLogLines: 0 });
    assert.equal(json.maxLogLines, before.maxLogLines);
  });

  test("changes persist across a fresh read", async () => {
    await s.api.put("/api/config", { linearWorkspace: "persisted" });
    const { json } = await s.api.get("/api/config");
    assert.equal(json.linearWorkspace, "persisted");
  });

  test("POST /api/config/reset restores defaults but keeps the temp parentDir semantics", async () => {
    await s.api.put("/api/config", { maxScanDepth: 7, linearWorkspace: "x", maxLogLines: 123 });
    const { status, json } = await s.api.post("/api/config/reset");
    assert.equal(status, 200);
    assert.equal(json.maxScanDepth, 3);
    assert.equal(json.linearWorkspace, "");
    assert.equal(json.maxLogLines, 2000);
  });
});
