const { test } = require("node:test");
const assert = require("node:assert");

const {
  stopRunningApps,
  classify,
  versionFromPath,
  executableOf,
} = require("../bin/install-app");
const { summariseStopped } = require("../bin/cli");
const { createInstallLogger } = require("../bin/install-log");

/**
 * These cover the failure that prompted them: an update that leaves the old version running and
 * reports nothing. Every call to the outside world is injected, so nothing here signals a real
 * process.
 */

const HOME = "/Users/x";
const UID = 501;

/** A machine whose process table is `processes`, with pids that die when signalled. */
function fakeMachine(processes, { ignoresSigterm = [] } = {}) {
  const living = new Set(processes.map((p) => p.pid));
  const signals = [];
  let clock = 0;

  return {
    signals,
    living,
    deps: {
      listProcesses: () => processes,
      homeDir: HOME,
      uid: UID,
      kill: (pid, signal) => {
        if (!living.has(pid)) throw new Error("ESRCH");
        signals.push({ pid, signal });
        if (signal === "SIGKILL" || !ignoresSigterm.includes(pid)) living.delete(pid);
      },
      alive: (pid) => living.has(pid),
      sleep: () => {
        clock += 200;
      },
      now: () => clock,
      graceMs: 1000,
      selfPid: 999,
      parentPid: 998,
    },
  };
}

const CACHED_SERVER = "/Users/x/.kablan/bin/v0.9.1/macos-arm64/kablan";
const BUNDLE_SERVER = "/Users/x/Applications/Kablan.app/Contents/MacOS/kablan-server";
const MCP_SERVER = "/Users/x/.kablan/bin/v0.9.1/macos-arm64/kablan-mcp";

// Same binary, same shape, somebody else's: a second HOME for this user (a sandbox, a test
// harness, a second account's home on a shared box) and a second account on the machine.
const OTHER_HOME_SERVER = "/Users/x/sandbox/home/.kablan/bin/v0.11.6/macos-arm64/kablan";
const OTHER_USER_SERVER = "/Users/y/.kablan/bin/v0.11.5/macos-arm64/kablan";

test("stops every managed process, not just the first", () => {
  const machine = fakeMachine([
    { pid: 100, command: CACHED_SERVER },
    { pid: 200, command: BUNDLE_SERVER },
    { pid: 300, command: MCP_SERVER },
  ]);

  const { stopped } = stopRunningApps(machine.deps);

  assert.deepStrictEqual(
    stopped.map((s) => s.pid),
    [100, 200, 300],
    "all three should be stopped; the old code returned after the first"
  );
  assert.deepStrictEqual(machine.signals.map((s) => s.signal), [
    "SIGTERM",
    "SIGTERM",
    "SIGTERM",
  ]);
  assert.strictEqual(machine.living.size, 0);
});

test("leaves processes that are not ours alone", () => {
  // The dev server in this checkout is the one that broke the old port-file approach: it holds a
  // port and looks plausible, but no update of ours replaces it.
  const machine = fakeMachine([
    { pid: 100, command: "/Users/x/Projects/kablan-app/target/debug/server" },
    { pid: 101, command: "/Users/x/Projects/kablan-app/target/release/server" },
    { pid: 102, command: "node /Users/x/.npm/_npx/abc/node_modules/.bin/kablan" },
    { pid: 103, command: "/Applications/Kablan Notes.app/Contents/MacOS/Notes" },
    { pid: 104, command: "vim kablan.rs" },
  ]);

  const { stopped } = stopRunningApps(machine.deps);

  assert.deepStrictEqual(stopped, []);
  assert.deepStrictEqual(machine.signals, [], "nothing should have been signalled");
});

test("never signals itself or the npx wrapper that spawned it", () => {
  const machine = fakeMachine([
    { pid: 999, command: CACHED_SERVER },
    { pid: 998, command: CACHED_SERVER },
    { pid: 100, command: CACHED_SERVER },
  ]);

  const { stopped, skipped } = stopRunningApps(machine.deps);

  assert.deepStrictEqual(stopped.map((s) => s.pid), [100]);
  assert.deepStrictEqual(skipped, [
    { pid: 999, reason: "self" },
    { pid: 998, reason: "self" },
  ]);
});

test("escalates to SIGKILL when SIGTERM is ignored", () => {
  const machine = fakeMachine([{ pid: 100, command: CACHED_SERVER }], {
    ignoresSigterm: [100],
  });

  const { stopped } = stopRunningApps(machine.deps);

  assert.deepStrictEqual(machine.signals, [
    { pid: 100, signal: "SIGTERM" },
    { pid: 100, signal: "SIGKILL" },
  ]);
  assert.strictEqual(stopped[0].signal, "SIGKILL");
  assert.strictEqual(machine.living.size, 0);
});

test("a process that exits on its own is not killed twice", () => {
  const machine = fakeMachine([{ pid: 100, command: CACHED_SERVER }]);

  const { stopped } = stopRunningApps(machine.deps);

  assert.strictEqual(machine.signals.length, 1);
  assert.strictEqual(stopped[0].signal, "SIGTERM");
});

test("reports nothing when nothing is running", () => {
  const machine = fakeMachine([]);
  assert.deepStrictEqual(stopRunningApps(machine.deps), { stopped: [], skipped: [] });
});

test("a process that disappears between listing and signalling is skipped, not fatal", () => {
  const processes = [
    { pid: 100, command: CACHED_SERVER },
    { pid: 200, command: CACHED_SERVER },
  ];
  const machine = fakeMachine(processes);
  machine.living.delete(100); // exited while we were listing

  const { stopped, skipped } = stopRunningApps(machine.deps);

  assert.deepStrictEqual(skipped, [{ pid: 100, reason: "could not signal" }]);
  assert.deepStrictEqual(stopped.map((s) => s.pid), [200], "the second one still gets stopped");
});

test("only the executable counts, never the arguments", () => {
  // Observed on a real machine: `ps` prints whole command lines, so the shell that launched a
  // server carries the server's path in its arguments. Matching anywhere in the line would have
  // signalled the shell — and, in a terminal, that is the user's session.
  assert.strictEqual(classify(`/bin/zsh -c nohup ${CACHED_SERVER}`, HOME), null);
  assert.strictEqual(classify(`tail -f ${CACHED_SERVER}`, HOME), null);
  assert.strictEqual(classify(`/usr/bin/vim ${CACHED_SERVER}`, HOME), null);
  assert.strictEqual(classify(`${CACHED_SERVER} --mcp`, HOME), "server", "args of our own are fine");
  assert.strictEqual(executableOf("/bin/zsh -c foo"), "/bin/zsh");
  assert.strictEqual(executableOf(CACHED_SERVER), CACHED_SERVER);
});

test("a shell holding the path in its arguments is never signalled", () => {
  const machine = fakeMachine([
    { pid: 100, command: `/bin/zsh -c nohup ${CACHED_SERVER}` },
    { pid: 200, command: CACHED_SERVER },
  ]);

  const { stopped } = stopRunningApps(machine.deps);

  assert.deepStrictEqual(stopped.map((s) => s.pid), [200]);
  assert.deepStrictEqual(machine.signals, [{ pid: 200, signal: "SIGTERM" }]);
});

test("classify names the kinds it knows and refuses the rest", () => {
  assert.strictEqual(classify(CACHED_SERVER, HOME), "server");
  assert.strictEqual(classify(MCP_SERVER, HOME), "MCP server");
  assert.strictEqual(classify(BUNDLE_SERVER, HOME), "installed app");
  assert.strictEqual(classify("/Users/x/Projects/kablan-app/target/debug/server", HOME), null);
  assert.strictEqual(classify("/usr/bin/vim", HOME), null);
});

test("a bundle dragged to /Applications is still ours", () => {
  // --install only ever writes ~/Applications, but a copy moved to /Applications that survives
  // an update is the silent-old-version failure this whole mechanism exists to prevent. The uid
  // test, not the path, is what keeps another account's copy out of this.
  assert.strictEqual(
    classify("/Applications/Kablan.app/Contents/MacOS/kablan-server", HOME),
    "installed app"
  );
  assert.strictEqual(classify("/Applications/Kablan Notes.app/Contents/MacOS/Notes", HOME), null);
});

test("a cache under another HOME is not ours to stop", () => {
  // F5: classify matched `/.kablan/bin/` anywhere in the path, and every HOME's cache contains
  // that — so an install under one HOME SIGTERMed servers installed under another.
  assert.strictEqual(classify(OTHER_HOME_SERVER, HOME), null);
  assert.strictEqual(classify(OTHER_USER_SERVER, HOME), null);
  assert.strictEqual(
    classify("/Users/y/Applications/Kablan.app/Contents/MacOS/kablan-server", HOME),
    null
  );
  assert.strictEqual(classify(CACHED_SERVER, HOME), "server", "our own is still ours");
});

test("a server under another HOME is left running", () => {
  const machine = fakeMachine([
    { pid: 100, command: CACHED_SERVER, uid: UID },
    { pid: 200, command: OTHER_HOME_SERVER, uid: UID },
  ]);

  const { stopped } = stopRunningApps(machine.deps);

  assert.deepStrictEqual(stopped.map((s) => s.pid), [100]);
  assert.deepStrictEqual(machine.signals, [{ pid: 100, signal: "SIGTERM" }]);
  assert.ok(machine.living.has(200), "the other HOME's server should still be running");
});

test("our own path under another account is skipped, not signalled", () => {
  // A shared machine: the path test cannot see the difference once two accounts' bundles sit in
  // /Applications, so ownership is the uid.
  const machine = fakeMachine([
    { pid: 100, command: "/Applications/Kablan.app/Contents/MacOS/kablan-server", uid: 502 },
    { pid: 200, command: CACHED_SERVER, uid: UID },
  ]);

  const { stopped, skipped } = stopRunningApps(machine.deps);

  assert.deepStrictEqual(stopped.map((s) => s.pid), [200]);
  assert.deepStrictEqual(skipped, [{ pid: 100, reason: "another user" }]);
  assert.ok(machine.living.has(100), "another account's server should still be running");
});

test("a process table with no uid column falls back to the path test", () => {
  // `ps` on every platform we ship to reports a uid. If one ever does not, listing nothing — or
  // stopping nothing — would be worse than the guarantee the paths alone already give.
  const machine = fakeMachine([
    { pid: 100, command: CACHED_SERVER, uid: undefined },
    { pid: 200, command: OTHER_HOME_SERVER, uid: undefined },
  ]);

  const { stopped } = stopRunningApps(machine.deps);

  assert.deepStrictEqual(stopped.map((s) => s.pid), [100]);
});

test("versionFromPath reads the cached version, and copes when it cannot", () => {
  assert.strictEqual(versionFromPath(CACHED_SERVER), "v0.9.1");
  assert.strictEqual(versionFromPath(BUNDLE_SERVER), null);
});

test("the summary line says what was stopped", () => {
  assert.strictEqual(summariseStopped([]), "Stopped 0 running processes");
  assert.strictEqual(
    summariseStopped([{ kind: "server", version: "v0.9.1", pid: 35115, signal: "SIGTERM" }]),
    "Stopped 1 running process: server v0.9.1 pid 35115 via SIGTERM"
  );
  assert.strictEqual(
    summariseStopped([
      { kind: "server", version: "v0.9.1", pid: 1, signal: "SIGTERM" },
      { kind: "installed app", version: null, pid: 2, signal: "SIGKILL" },
    ]),
    "Stopped 2 running processes: server v0.9.1 pid 1 via SIGTERM, " +
      "installed app (unknown version) pid 2 via SIGKILL"
  );
});

test("the log both prints and appends, with a timestamp", () => {
  const printed = [];
  const appended = [];
  const log = createInstallLogger({
    print: (line) => printed.push(line),
    appendFile: (file, text) => appended.push({ file, text }),
    file: "/tmp/install.log",
    stamp: () => "2026-09-02T19:00:00.000Z",
  });

  log("Stopping server v0.9.1 (pid 100)");

  assert.deepStrictEqual(printed, ["Stopping server v0.9.1 (pid 100)"]);
  assert.deepStrictEqual(appended, [
    {
      file: "/tmp/install.log",
      text: "2026-09-02T19:00:00.000Z Stopping server v0.9.1 (pid 100)\n",
    },
  ]);
});

test("a log file that cannot be written does not fail the install", () => {
  const printed = [];
  const log = createInstallLogger({
    print: (line) => printed.push(line),
    appendFile: () => {
      throw new Error("EROFS: read-only file system");
    },
  });

  assert.doesNotThrow(() => log("Installing v0.9.2"));
  assert.deepStrictEqual(printed, ["Installing v0.9.2"]);
});

test("stopping is logged per process, and the log survives a machine with none", () => {
  const lines = [];
  const machine = fakeMachine([{ pid: 100, command: CACHED_SERVER }]);
  stopRunningApps({ ...machine.deps, log: (l) => lines.push(l) });
  assert.deepStrictEqual(lines, ["Stopping server v0.9.1 (pid 100)"]);

  const quiet = [];
  stopRunningApps({ ...fakeMachine([]).deps, log: (l) => quiet.push(l) });
  assert.deepStrictEqual(quiet, []);
});
