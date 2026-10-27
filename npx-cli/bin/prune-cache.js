/**
 * The version cache sweeper.
 *
 * `~/.kablan/bin` keeps one directory per version of the server it has ever downloaded, about
 * 45MB each, and until this file nothing ever deleted one. On the machine the cold-start audit
 * ran on that cache had reached 1.8GB across 39 versions — nearly four times the database it
 * exists to serve.
 *
 * What this keeps: the version running now, and one previous. Everything else goes.
 *
 * Three things stop a directory being deleted no matter where it sorts:
 *
 *   - a live process is running out of it. Another Kablan may be serving an older version right
 *     now, and the process table is the only honest way to know. If it cannot be read the sweep
 *     does not run at all — deleting on an assumption is how you pull a binary out from under a
 *     running server.
 *   - its name is not a version directory. Anything this file does not recognise, it leaves.
 *   - `KABLAN_LOCAL=1`, where the binaries came from `./local-build.sh` and not from a release.
 *     Those are not re-downloadable and deleting one costs a rebuild.
 */

const fs = require("fs");
const path = require("path");
const { BINARY_TAG, CACHE_DIR, LOCAL_DEV_MODE } = require("./download");
const { runningCacheVersions, formatBytes, tildePath } = require("./install-app");

/** The current version, plus this many older ones. */
const KEEP_PREVIOUS = 1;

/** `v0.11.6`. The directory names the downloader writes, and nothing else. */
const VERSION_DIR = /^v\d+(?:\.\d+)*$/;

/**
 * Newest first. Compares the numeric components, so v0.10.0 sorts above v0.9.9 — which a string
 * sort gets backwards, and getting it backwards here deletes the two newest versions.
 */
function compareVersions(a, b) {
  const parts = (v) => v.slice(1).split(".").map(Number);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (right[i] || 0) - (left[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Bytes on disk under `dir`, counting regular files only. Best effort: unreadable entries count 0. */
function directorySize(dir) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += directorySize(full);
      continue;
    }
    try {
      const stat = fs.lstatSync(full);
      if (stat.isFile()) total += stat.size;
    } catch {
      // Raced a delete, or a permission we do not have. Zero is the honest answer.
    }
  }
  return total;
}

/**
 * Decide and delete. Pure enough to test: every edge of the outside world is a seam.
 *
 * @param {object} [deps]
 * @returns {{status: string, pruned: Array<{version: string, bytes: number}>,
 *            kept: Array<{version: string, reason: string}>, reclaimed: number,
 *            failed: Array<{version: string, error: string}>, cacheRoot: string}}
 *
 * `status` is one of:
 *   `disabled`     KABLAN_NO_PRUNE=1
 *   `local`        KABLAN_LOCAL=1 — not our binaries to delete
 *   `unreadable`   the process table would not answer, so nothing was touched
 *   `nothing`      every directory in the cache is one we keep
 *   `pruned`       at least one directory was deleted
 */
function pruneVersionCache(deps = {}) {
  const {
    cacheRoot = CACHE_DIR,
    currentVersion = BINARY_TAG,
    keepPrevious = KEEP_PREVIOUS,
    localDevMode = LOCAL_DEV_MODE,
    disabled = process.env.KABLAN_NO_PRUNE === "1",
    listRunning = runningCacheVersions,
    listEntries = () => fs.readdirSync(cacheRoot, { withFileTypes: true }),
    sizeOf = directorySize,
    remove = (dir) => fs.rmSync(dir, { recursive: true, force: true }),
  } = deps;

  const empty = { pruned: [], kept: [], failed: [], reclaimed: 0, cacheRoot };

  if (disabled) return { ...empty, status: "disabled" };
  if (localDevMode) return { ...empty, status: "local" };

  let names;
  try {
    names = listEntries()
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => VERSION_DIR.test(name));
  } catch {
    // No cache yet, or we cannot read it. Either way there is nothing to sweep.
    return { ...empty, status: "nothing" };
  }

  // Asked before anything is deleted, and a refusal stops the sweep rather than softening it.
  const running = listRunning();
  if (running === null) return { ...empty, status: "unreadable" };

  const ordered = names.slice().sort(compareVersions);
  const keepers = new Map();

  // The version we just ran, whether or not it sorts highest — `npx kablan@0.10.0` on a machine
  // that has seen 0.11.6 is a downgrade, and deleting the binary it is about to launch from
  // would be an interesting way to end a session.
  keepers.set(currentVersion, "current");

  let previousKept = 0;
  for (const name of ordered) {
    if (keepers.has(name)) continue;
    if (previousKept >= keepPrevious) break;
    keepers.set(name, "previous");
    previousKept += 1;
  }

  for (const name of running) {
    if (!keepers.has(name)) keepers.set(name, "running");
  }

  const pruned = [];
  const kept = [];
  const failed = [];
  let reclaimed = 0;

  for (const name of ordered) {
    const reason = keepers.get(name);
    if (reason) {
      kept.push({ version: name, reason });
      continue;
    }
    const dir = path.join(cacheRoot, name);
    const bytes = sizeOf(dir);
    try {
      remove(dir);
    } catch (err) {
      failed.push({ version: name, error: err.message });
      continue;
    }
    pruned.push({ version: name, bytes });
    reclaimed += bytes;
  }

  return {
    status: pruned.length > 0 ? "pruned" : "nothing",
    pruned,
    kept,
    failed,
    reclaimed,
    cacheRoot,
  };
}

/**
 * What the user is told. Silent deletion of 1.6GB is its own bug report, so a sweep that removed
 * something always says so, names what it kept, and says how to turn it off.
 *
 * A sweep that removed nothing says nothing — the common case is a cache of two directories, and
 * a line about it on every single start is noise.
 *
 * @returns {string[]} lines; empty when there is nothing worth saying
 */
function describePrune(result, homeDir) {
  const lines = [];
  if (!result) return lines;

  if (result.status === "unreadable" && process.env.KABLAN_DEBUG) {
    lines.push("Cache sweep skipped: could not read the process table to see what is running.");
    return lines;
  }

  if (result.status !== "pruned") {
    if (result.failed && result.failed.length > 0) {
      for (const { version, error } of result.failed) {
        lines.push(`Could not remove cached ${version}: ${error}`);
      }
    }
    return lines;
  }

  const where = tildePath(result.cacheRoot, homeDir);
  const count = result.pruned.length;
  lines.push(
    `Pruned ${count} cached version${count === 1 ? "" : "s"} from ${where}, ` +
      `reclaiming ${formatBytes(result.reclaimed)}: ` +
      result.pruned.map((e) => e.version).join(", ")
  );

  const kept = result.kept.map((e) => (e.reason === "running" ? `${e.version} (running)` : e.version));
  if (kept.length > 0) lines.push(`  Kept ${kept.join(", ")}. Set KABLAN_NO_PRUNE=1 to keep them all.`);

  for (const { version, error } of result.failed) {
    lines.push(`  Could not remove ${version}: ${error}`);
  }

  return lines;
}

module.exports = {
  pruneVersionCache,
  describePrune,
  compareVersions,
  directorySize,
  KEEP_PREVIOUS,
  VERSION_DIR,
};
