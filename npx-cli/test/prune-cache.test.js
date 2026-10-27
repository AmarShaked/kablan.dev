const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  pruneVersionCache,
  describePrune,
  compareVersions,
  directorySize,
} = require("../bin/prune-cache");
const { runningCacheVersions } = require("../bin/install-app");

/** A cache of version directories, as readdirSync(withFileTypes) would report it. */
function entries(...names) {
  return names.map((name) => ({ name, isDirectory: () => true }));
}

/** Everything stubbed; each test overrides only what it is about. */
function sweep(overrides = {}) {
  const removed = [];
  const result = pruneVersionCache({
    cacheRoot: "/home/u/.kablan/bin",
    currentVersion: "v0.11.6",
    localDevMode: false,
    disabled: false,
    listRunning: () => new Set(),
    listEntries: () => entries("v0.11.6", "v0.11.5", "v0.11.3", "v0.10.0"),
    sizeOf: () => 45 * 1024 * 1024,
    remove: (dir) => removed.push(dir),
    ...overrides,
  });
  return { result, removed };
}

const versionsOf = (list) => list.map((e) => e.version);

test("keeps the current version and one previous, deletes the rest", () => {
  const { result, removed } = sweep();

  assert.deepStrictEqual(versionsOf(result.pruned), ["v0.11.3", "v0.10.0"]);
  assert.deepStrictEqual(versionsOf(result.kept), ["v0.11.6", "v0.11.5"]);
  assert.deepStrictEqual(removed, [
    path.join("/home/u/.kablan/bin", "v0.11.3"),
    path.join("/home/u/.kablan/bin", "v0.10.0"),
  ]);
  assert.strictEqual(result.status, "pruned");
  assert.strictEqual(result.reclaimed, 2 * 45 * 1024 * 1024);
});

test("orders by version number, not by string — v0.10.0 is newer than v0.9.9", () => {
  const { result } = sweep({
    currentVersion: "v0.10.0",
    listEntries: () => entries("v0.9.9", "v0.10.0", "v0.9.20", "v0.9.3"),
  });

  // The string sort this guards against puts v0.9.9 on top and deletes both 0.10 releases.
  assert.deepStrictEqual(versionsOf(result.kept), ["v0.10.0", "v0.9.20"]);
  assert.deepStrictEqual(versionsOf(result.pruned), ["v0.9.9", "v0.9.3"]);
});

test("compareVersions sorts newest first across unequal component counts", () => {
  const sorted = ["v0.9.1", "v0.11", "v0.11.0.1", "v0.10.13"].sort(compareVersions);
  assert.deepStrictEqual(sorted, ["v0.11.0.1", "v0.11", "v0.10.13", "v0.9.1"]);
});

test("keeps the version we are about to run even when it is a downgrade", () => {
  const { result } = sweep({
    currentVersion: "v0.10.0",
    listEntries: () => entries("v0.11.6", "v0.11.5", "v0.10.0"),
  });

  assert.ok(result.kept.some((e) => e.version === "v0.10.0" && e.reason === "current"));
  assert.deepStrictEqual(versionsOf(result.pruned), ["v0.11.5"]);
});

test("keeps a version that has a live process, wherever it sorts", () => {
  const { result, removed } = sweep({
    listRunning: () => new Set(["v0.10.0"]),
  });

  assert.deepStrictEqual(versionsOf(result.pruned), ["v0.11.3"]);
  assert.ok(result.kept.some((e) => e.version === "v0.10.0" && e.reason === "running"));
  assert.ok(!removed.some((dir) => dir.endsWith("v0.10.0")));
});

test("deletes nothing when the process table cannot be read", () => {
  const { result, removed } = sweep({ listRunning: () => null });

  assert.strictEqual(result.status, "unreadable");
  assert.deepStrictEqual(removed, []);
  assert.strictEqual(result.reclaimed, 0);
});

test("KABLAN_NO_PRUNE=1 deletes nothing and never reads the cache", () => {
  let looked = false;
  const { result, removed } = sweep({
    disabled: true,
    listEntries: () => {
      looked = true;
      return entries("v0.9.0");
    },
  });

  assert.strictEqual(result.status, "disabled");
  assert.deepStrictEqual(removed, []);
  assert.strictEqual(looked, false);
});

test("KABLAN_LOCAL=1 binaries are never pruned — they came from local-build.sh", () => {
  const { result, removed } = sweep({ localDevMode: true });

  assert.strictEqual(result.status, "local");
  assert.deepStrictEqual(removed, []);
});

test("leaves directories that are not version directories alone", () => {
  const { result, removed } = sweep({
    listEntries: () => [
      ...entries("v0.11.6", "v0.9.0", "scratch", "v0.9.0.bak"),
      { name: "stray.zip", isDirectory: () => false },
    ],
  });

  assert.deepStrictEqual(versionsOf(result.pruned), []);
  assert.deepStrictEqual(removed, []);
  assert.deepStrictEqual(versionsOf(result.kept), ["v0.11.6", "v0.9.0"]);
});

test("an unreadable cache directory is nothing to do, not a throw", () => {
  const { result } = sweep({
    listEntries: () => {
      throw new Error("ENOENT");
    },
  });

  assert.strictEqual(result.status, "nothing");
});

test("a directory that will not delete is reported, and the sweep continues", () => {
  const { result } = sweep({
    remove: (dir) => {
      if (dir.endsWith("v0.11.3")) throw new Error("EACCES: permission denied");
    },
  });

  assert.deepStrictEqual(versionsOf(result.pruned), ["v0.10.0"]);
  assert.deepStrictEqual(result.failed, [
    { version: "v0.11.3", error: "EACCES: permission denied" },
  ]);
  assert.strictEqual(result.reclaimed, 45 * 1024 * 1024);
});

test("says what it removed, what it kept, and how to turn it off", () => {
  const { result } = sweep({ listRunning: () => new Set(["v0.10.0"]) });
  const lines = describePrune(result, "/home/u");

  assert.match(lines[0], /Pruned 1 cached version from ~\/\.kablan\/bin/);
  assert.match(lines[0], /reclaiming 45 MB/);
  assert.match(lines[0], /v0\.11\.3/);
  assert.match(lines[1], /Kept v0\.11\.6, v0\.11\.5, v0\.10\.0 \(running\)/);
  assert.match(lines[1], /KABLAN_NO_PRUNE=1/);
});

test("says nothing when it removed nothing", () => {
  const { result } = sweep({ listEntries: () => entries("v0.11.6", "v0.11.5") });

  assert.strictEqual(result.status, "nothing");
  assert.deepStrictEqual(describePrune(result, "/home/u"), []);
});

test("directorySize adds up the files it can read", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kablan-prune-"));
  try {
    fs.mkdirSync(path.join(root, "macos-arm64"));
    fs.writeFileSync(path.join(root, "macos-arm64", "kablan"), Buffer.alloc(2048));
    fs.writeFileSync(path.join(root, "kablan.zip"), Buffer.alloc(1024));

    assert.strictEqual(directorySize(root), 3072);
    assert.strictEqual(directorySize(path.join(root, "nope")), 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("pruneVersionCache deletes a real directory tree off disk", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kablan-prune-"));
  try {
    for (const version of ["v0.11.6", "v0.11.5", "v0.9.0"]) {
      fs.mkdirSync(path.join(root, version, "macos-arm64"), { recursive: true });
      fs.writeFileSync(path.join(root, version, "macos-arm64", "kablan"), Buffer.alloc(4096));
    }

    const result = pruneVersionCache({
      cacheRoot: root,
      currentVersion: "v0.11.6",
      localDevMode: false,
      disabled: false,
      listRunning: () => new Set(),
    });

    assert.deepStrictEqual(versionsOf(result.pruned), ["v0.9.0"]);
    assert.strictEqual(result.reclaimed, 4096);
    assert.deepStrictEqual(fs.readdirSync(root).sort(), ["v0.11.5", "v0.11.6"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runningCacheVersions reads versions out of the process table", () => {
  const versions = runningCacheVersions({
    homeDir: "/home/u",
    listProcesses: () => [
      { pid: 1, uid: 0, command: "/sbin/launchd" },
      { pid: 2, uid: 501, command: "/home/u/.kablan/bin/v0.10.0/macos-arm64/kablan" },
      { pid: 3, uid: 501, command: "/home/u/.kablan/bin/v0.9.1/macos-arm64/kablan-mcp" },
      { pid: 4, uid: 501, command: "/home/u/Applications/Kablan.app/Contents/MacOS/Kablan" },
      { pid: 5, uid: 501, command: "/home/other/.kablan/bin/v0.8.0/macos-arm64/kablan" },
      { pid: 6, uid: 501, command: "/home/u/src/kablan-app/target/release/kablan" },
    ],
  });

  // The bundle launcher, another HOME's cache and a self-built server are none of our business.
  assert.deepStrictEqual([...versions].sort(), ["v0.10.0", "v0.9.1"]);
});

test("runningCacheVersions returns null rather than an empty set when ps says nothing", () => {
  // A real process table always contains this process; an empty one means ps failed or is
  // missing — Windows has no /bin/ps — and that must not read as "nothing is running".
  assert.strictEqual(runningCacheVersions({ listProcesses: () => [] }), null);
  assert.strictEqual(
    runningCacheVersions({
      listProcesses: () => {
        throw new Error("ps: command not found");
      },
    }),
    null
  );
});
