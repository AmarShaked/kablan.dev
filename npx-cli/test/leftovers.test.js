const { test } = require("node:test");
const assert = require("node:assert");

const { describeLeftovers, dataDir, formatBytes } = require("../bin/install-app");

/**
 * `--uninstall` used to print one line — "cached binaries are still in ~/.kablan/bin" — and stop
 * there. On the machine this was found on that directory was 1.8GB and the one it did not
 * mention, `~/Library/Application Support/dev.kablan.Kablan`, was another 449MB. Someone
 * uninstalling to get disk back was told about one of the two, with no hint the other existed.
 */

const HOME = "/Users/x";
const MB = 1024 * 1024;

/** A disk where only the named directories exist, at the named sizes. */
function disk(sizes) {
  return (dir) => (dir in sizes ? sizes[dir] : null);
}

function describe(sizes, { platform = "darwin", env = {} } = {}) {
  return describeLeftovers({ homeDir: HOME, platform, env, sizeOf: disk(sizes) }).join("\n");
}

test("it names the data directory, not just the binary cache", () => {
  const out = describe({
    "/Users/x/.kablan/bin": 1800 * MB,
    "/Users/x/Library/Application Support/dev.kablan.Kablan": 449 * MB,
  });

  assert.match(out, /~\/\.kablan\/bin/);
  assert.match(out, /~\/Library\/Application Support\/dev\.kablan\.Kablan/);
  assert.match(out, /1\.8 GB/);
  assert.match(out, /449 MB/);
});

test("it says what deleting the data directory costs you", () => {
  const out = describe({ "/Users/x/Library/Application Support/dev.kablan.Kablan": 449 * MB });
  assert.match(out, /deletes your Kablan history/);
});

test("the two commands differ in whether you keep your boards", () => {
  const out = describe({
    "/Users/x/.kablan/bin": 1800 * MB,
    "/Users/x/Library/Application Support/dev.kablan.Kablan": 449 * MB,
    "/Users/x/Library/Logs/Kablan": 3 * MB,
  });

  assert.match(out, /rm -rf "\$HOME\/\.kablan\/bin" "\$HOME\/Library\/Logs\/Kablan"\n/);
  assert.match(
    out,
    /rm -rf "\$HOME\/\.kablan\/bin" "\$HOME\/Library\/Application Support\/dev\.kablan\.Kablan" "\$HOME\/Library\/Logs\/Kablan"/
  );
});

test("the path with a space in it survives being pasted into a shell", () => {
  const out = describe({ "/Users/x/Library/Application Support/dev.kablan.Kablan": 1 * MB });
  assert.match(out, /"\$HOME\/Library\/Application Support\/dev\.kablan\.Kablan"/);
  assert.ok(
    !/rm -rf \$HOME\/Library\/Application Support/.test(out),
    "unquoted, this would delete ~/Library/Application and then a directory called Support"
  );
});

test("it never offers to delete ~/.kablan itself", () => {
  // ~/.kablan also holds `worktrees` and `chat_history`, which are the user's work.
  const out = describe({ "/Users/x/.kablan/bin": 1800 * MB });
  assert.ok(!/rm -rf "\$HOME\/\.kablan"/.test(out), "that would take the worktrees with it");
});

test("a directory that is not there is not mentioned", () => {
  const out = describe({ "/Users/x/.kablan/bin": 10 * MB });
  assert.match(out, /~\/\.kablan\/bin/);
  assert.ok(!out.includes("Application Support"), "nothing to say about a directory with no data");
});

test("a machine with nothing left prints nothing", () => {
  assert.deepStrictEqual(
    describeLeftovers({ homeDir: HOME, platform: "darwin", env: {}, sizeOf: () => null }),
    []
  );
});

test("Windows gets paths and no rm -rf", () => {
  // The separators here are this host's, not Windows' — `path` builds what it runs on. What is
  // under test is the advice, which is wrong on Windows whatever the slashes look like.
  const env = { APPDATA: "C:\\Users\\x\\AppData\\Roaming" };
  const out = describe({ [dataDir(HOME, "win32", env)]: 5 * MB }, { platform: "win32", env });

  assert.match(out, /Kablan/);
  assert.match(out, /deletes your Kablan history/);
  assert.ok(!out.includes("rm -rf"), "rm is not a command there");
  assert.ok(!out.includes("Logs"), "the log directory is written by the macOS launcher only");
});

test("dataDir matches what crates/utils/src/assets.rs builds", () => {
  // ProjectDirs::from("dev", "kablan", "Kablan").data_dir(), per platform.
  assert.strictEqual(
    dataDir(HOME, "darwin", {}),
    "/Users/x/Library/Application Support/dev.kablan.Kablan"
  );
  assert.strictEqual(dataDir(HOME, "linux", {}), "/Users/x/.local/share/kablan");
  assert.strictEqual(
    dataDir(HOME, "linux", { XDG_DATA_HOME: "/data" }),
    "/data/kablan",
    "XDG_DATA_HOME wins, as it does in the directories crate"
  );
});

test("sizes read the way a person would say them", () => {
  assert.strictEqual(formatBytes(0), "0 B");
  assert.strictEqual(formatBytes(900), "900 B");
  assert.strictEqual(formatBytes(1536), "1.5 KB");
  assert.strictEqual(formatBytes(467587072), "446 MB");
  assert.strictEqual(formatBytes(1800 * MB), "1.8 GB");
});
