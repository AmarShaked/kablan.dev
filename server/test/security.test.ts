import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { startServer, initRepo, type TestServer } from "./harness.ts";

/**
 * Black-box security tests: path-traversal / input-validation guards.
 *
 * The `:name` route segment is percent-encoded so traversing payloads survive
 * intact to the server (fetch/URL normalises raw "../"). encodeURIComponent
 * turns "/" into %2F and "." stays literal, so e.g. "../../etc" arrives at the
 * server as the literal string "../../etc" and must be rejected by
 * projectPathFromName's "stay inside parentDir" check.
 */

// Names that, once resolved against parentDir, escape it.
const TRAVERSING_NAMES = ["..", "../..", "../../etc", "foo/../../bar"];

// Percent-encode separators AND dots so a traversing name survives the
// fetch/URL layer intact as a single literal segment (a raw "../" would be
// normalised away before it ever reaches the server). The server decodes the
// segment back to the original string, exercising projectPathFromName's guard.
//
// A caveat of the WHATWG URL parser: a path segment that decodes to a pure
// dot-segment (".", "..", even when written "%2e%2e") is still collapsed and
// removed before the request is sent, so it can never reach the server. To
// keep such a name a genuine parent-escape that DOES reach the server, we
// append a trailing encoded slash (%2F stays literal), turning ".." into the
// still-escaping "../" — which projectPathFromName rejects just the same.
const enc = (name: string) => {
  const e = encodeURIComponent(name).replace(/\./g, "%2e");
  return /^(?:%2e)+$/i.test(e) ? e + "%2F" : e;
};

describe("security: path-traversal / input-validation guards", () => {
  let s: TestServer;
  before(async () => {
    s = await startServer();
  });
  after(async () => {
    await s.stop();
  });

  test("GET /branches rejects traversing project names with 400", async () => {
    for (const name of TRAVERSING_NAMES) {
      const { status } = await s.api.get(`/api/projects/${enc(name)}/branches`);
      assert.equal(status, 400, `branches for ${JSON.stringify(name)} should be 400`);
    }
  });

  test("GET /worktrees rejects traversing project names with 400", async () => {
    for (const name of TRAVERSING_NAMES) {
      const { status } = await s.api.get(`/api/projects/${enc(name)}/worktrees`);
      assert.equal(status, 400, `worktrees for ${JSON.stringify(name)} should be 400`);
    }
  });

  test("POST /checkout rejects traversing project names with 400", async () => {
    for (const name of TRAVERSING_NAMES) {
      const { status } = await s.api.post(`/api/projects/${enc(name)}/checkout`, { branch: "main" });
      assert.equal(status, 400, `checkout for ${JSON.stringify(name)} should be 400`);
    }
  });

  test("PUT /command rejects traversing project names with 400", async () => {
    for (const name of TRAVERSING_NAMES) {
      const { status } = await s.api.put(`/api/projects/${enc(name)}/command`, { devCommand: "x" });
      assert.equal(status, 400, `command for ${JSON.stringify(name)} should be 400`);
    }
  });

  test("DELETE /config/overrides rejects traversing project names with 400", async () => {
    for (const name of TRAVERSING_NAMES) {
      const { status } = await s.api.del(`/api/config/overrides/${enc(name)}`);
      assert.equal(status, 400, `delete override for ${JSON.stringify(name)} should be 400`);
    }
  });

  test("control: a valid existing repo name is accepted (guard is not over-broad)", async () => {
    await initRepo(join(s.workspace, "goodrepo"));
    const { status, json } = await s.api.get(`/api/projects/${enc("goodrepo")}/branches`);
    assert.equal(status, 200);
    assert.ok(Array.isArray(json), "branches should be an array");
  });

  // POST /api/open-url hands its argument to the OS launcher, and the URLs reaching it come from
  // rendered agent/tool output — so anything but a web/mail link must be refused before spawn.
  test("POST /api/open-url rejects a missing url and non-web schemes with 400", async () => {
    const rejected = [
      undefined,
      "",
      "   ",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "vscode://file/etc/passwd",
      "/etc/passwd",
      "example.com",
    ];
    for (const url of rejected) {
      const { status } = await s.api.post("/api/open-url", url === undefined ? {} : { url });
      assert.equal(status, 400, `open-url ${JSON.stringify(url)} should be 400`);
    }
  });

  test("resolveWorkdir guard: cwd outside the repo/worktrees is rejected with 400", async () => {
    await initRepo(join(s.workspace, "wdrepo"));

    const env = await s.api.get(`/api/projects/${enc("wdrepo")}/env?cwd=${encodeURIComponent("/tmp/nope")}`);
    assert.equal(env.status, 400, "env with foreign cwd should be 400");

    const commits = await s.api.get(`/api/projects/${enc("wdrepo")}/commits?cwd=${encodeURIComponent("/etc")}`);
    assert.equal(commits.status, 400, "commits with foreign cwd should be 400");
  });
});
