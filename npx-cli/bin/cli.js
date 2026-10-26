#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const AdmZip = require("adm-zip");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { ensureBinary, BINARY_TAG, CACHE_DIR, LOCAL_DEV_MODE, LOCAL_DIST_DIR, getLatestVersion } = require("./download");
const {
  installMacApp,
  uninstallMacApp,
  appDir,
  describeLeftovers,
  dataDir,
  tildePath,
  APP_NAME,
} = require("./install-app");
const { createInstallLogger, installLogPath } = require("./install-log");

const CLI_VERSION = require("../package.json").version;

// Resolve effective arch for our published 64-bit binaries only.
// Any ARM → arm64; anything else → x64. On macOS, handle Rosetta.
function getEffectiveArch() {
  const platform = process.platform;
  const nodeArch = process.arch;

  if (platform === "darwin") {
    // If Node itself is arm64, we're natively on Apple silicon
    if (nodeArch === "arm64") return "arm64";

    // Otherwise check for Rosetta translation
    try {
      const translated = execSync("sysctl -in sysctl.proc_translated", {
        encoding: "utf8",
      }).trim();
      if (translated === "1") return "arm64";
    } catch {
      // sysctl key not present → assume true Intel
    }
    return "x64";
  }

  // Non-macOS: coerce to broad families we support
  if (/arm/i.test(nodeArch)) return "arm64";

  // On Windows with 32-bit Node (ia32), detect OS arch via env
  if (platform === "win32") {
    const pa = process.env.PROCESSOR_ARCHITECTURE || "";
    const paw = process.env.PROCESSOR_ARCHITEW6432 || "";
    if (/arm/i.test(pa) || /arm/i.test(paw)) return "arm64";
  }

  return "x64";
}

const platform = process.platform;
const arch = getEffectiveArch();

// Map to our build target names
function getPlatformDir() {
  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "linux" && arch === "arm64") return "linux-arm64";
  if (platform === "win32" && arch === "x64") return "windows-x64";
  if (platform === "win32" && arch === "arm64") return "windows-arm64";
  if (platform === "darwin" && arch === "x64") return "macos-x64";
  if (platform === "darwin" && arch === "arm64") return "macos-arm64";

  console.error(`Unsupported platform: ${platform}-${arch}`);
  console.error("Supported platforms:");
  console.error("  - Linux x64");
  console.error("  - Linux ARM64");
  console.error("  - Windows x64");
  console.error("  - Windows ARM64");
  console.error("  - macOS x64 (Intel)");
  console.error("  - macOS ARM64 (Apple Silicon)");
  process.exit(1);
}

function getBinaryName(base) {
  return platform === "win32" ? `${base}.exe` : base;
}

// Resolved on demand, not at load: getPlatformDir() exits the process on a platform we do not
// publish for, and `--help` and `--version` have to work there too — telling someone their
// platform is unsupported is most of what those two are for on such a machine.
let resolvedPlatformDir = null;
function platformDir() {
  if (!resolvedPlatformDir) resolvedPlatformDir = getPlatformDir();
  return resolvedPlatformDir;
}

// In local dev mode, extract directly to dist directory; otherwise use global cache
function versionCacheDir() {
  return LOCAL_DEV_MODE
    ? path.join(LOCAL_DIST_DIR, platformDir())
    : path.join(CACHE_DIR, BINARY_TAG, platformDir());
}

/**
 * Download progress, in a shape that suits where it is going.
 *
 * A terminal gets one line rewritten in place. Anything else — a CI log, a redirect to a file,
 * a parent process capturing stderr — gets a handful of whole lines, because `\r` means nothing
 * there and a 15MB download at one update per chunk wrote about 700 lines into the log.
 *
 * @param {object} [deps] injected by the tests; `isTTY` is the whole decision
 */
function createProgressReporter(deps = {}) {
  const {
    isTTY = Boolean(process.stderr.isTTY),
    write = (text) => process.stderr.write(text),
    stepPercent = 25,
  } = deps;

  const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);
  let nextStep = stepPercent;
  let lastDownloaded = 0;

  return {
    update(downloaded, total) {
      lastDownloaded = downloaded;
      const percent = total ? Math.round((downloaded / total) * 100) : 0;
      const totalMb = total ? mb(total) : "?";

      if (isTTY) {
        write(`\r   Downloading: ${mb(downloaded)}MB / ${totalMb}MB (${percent}%)`);
        return;
      }

      // 100% is left to done(), so the end is one line rather than two near-identical ones.
      if (!total || percent >= 100 || percent < nextStep) return;
      while (nextStep <= percent) nextStep += stepPercent;
      write(`   Downloading: ${mb(downloaded)}MB / ${totalMb}MB (${percent}%)\n`);
    },

    done() {
      if (isTTY) {
        write("\n");
        return;
      }
      if (lastDownloaded > 0) write(`   Downloaded ${mb(lastDownloaded)}MB\n`);
    },
  };
}

async function extractAndRun(baseName, launch) {
  const cacheDir = versionCacheDir();
  const binName = getBinaryName(baseName);
  const binPath = path.join(cacheDir, binName);
  const zipPath = path.join(cacheDir, `${baseName}.zip`);

  // Clean old binary if exists
  try {
    if (fs.existsSync(binPath)) {
      fs.unlinkSync(binPath);
    }
  } catch (err) {
    if (process.env.KABLAN_DEBUG) {
      console.warn(`Warning: Could not delete existing binary: ${err.message}`);
    }
  }

  // Download if not cached
  if (!fs.existsSync(zipPath)) {
    console.error(`Downloading ${baseName}...`);
    const progress = createProgressReporter();
    try {
      await ensureBinary(platformDir(), baseName, (downloaded, total) =>
        progress.update(downloaded, total)
      );
      progress.done();
    } catch (err) {
      console.error(`\nDownload failed: ${err.message}`);
      process.exit(1);
    }
  }

  // Extract
  if (!fs.existsSync(binPath)) {
    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(cacheDir, true);
    } catch (err) {
      console.error("Extraction failed:", err.message);
      try {
        fs.unlinkSync(zipPath);
      } catch {}
      process.exit(1);
    }
  }

  if (!fs.existsSync(binPath)) {
    console.error(`Extracted binary not found at: ${binPath}`);
    console.error("This usually indicates a corrupt download. Please try again.");
    process.exit(1);
  }

  // Set permissions (non-Windows)
  if (platform !== "win32") {
    try {
      fs.chmodSync(binPath, 0o755);
    } catch {}
  }

  return launch(binPath);
}

/**
 * One line saying what was stopped, so the terminal and the log both show whether the update
 * actually displaced anything — the failure this reporting exists to catch is an update that
 * leaves the old version serving and says nothing.
 */
function summariseStopped(stopped) {
  if (!stopped || stopped.length === 0) return "Stopped 0 running processes";
  const detail = stopped
    .map((p) => `${p.kind} ${p.version || "(unknown version)"} pid ${p.pid} via ${p.signal}`)
    .join(", ");
  return `Stopped ${stopped.length} running process${stopped.length === 1 ? "" : "es"}: ${detail}`;
}

/**
 * The help, which is also the only documentation some people will read.
 *
 * Both this and --version used to fall through to "start a server and open a browser", which is
 * a surprising answer to the first two things anyone types at a CLI they do not know.
 */
function helpText() {
  const home = os.homedir();
  const bin = APP_NAME.toLowerCase();
  const logs =
    process.platform === "darwin"
      ? `\n  Logs       ${tildePath(path.join(home, "Library", "Logs", APP_NAME), home)}`
      : "";

  return `${bin} ${CLI_VERSION} — run coding agents against your repositories from a board

Usage
  npx ${bin}               Start Kablan and open it in your browser
  npx ${bin} --install     Install ${APP_NAME}.app into ~/Applications (macOS only)
  npx ${bin} --uninstall   Remove ${APP_NAME}.app, and say what is left on disk
  npx ${bin} --mcp         Run the MCP task server on stdin/stdout
  npx ${bin} --version     Print the version of this wrapper
  npx ${bin} --help        Print this

What you need
  Node 18 or newer, git, and a coding agent CLI you have already signed in to —
  Kablan drives the agent's own CLI and never sees your model credentials.

Where things go
  Binaries   ${tildePath(path.join(CACHE_DIR, BINARY_TAG), home)}/<platform>
  Data       ${tildePath(dataDir(), home)}
             Projects, tasks, settings and the database.${logs}

Environment
  KABLAN_DEBUG=1   Print stack traces, and warn about cache problems
  KABLAN_LOCAL=1   Use binaries built by ./local-build.sh instead of the release

Bugs: https://github.com/AmarShaked/kablan.dev/issues`;
}

/** Flags this wrapper understands. Anything else is a typo worth saying so about. */
const KNOWN_FLAGS = ["--mcp", "--install", "--uninstall", "--version", "-V", "--help", "-h"];

async function main() {
  const args = process.argv.slice(2);
  const isMcpMode = args.includes("--mcp");

  // Before anything touches the disk or the network: these answer from the package itself, and
  // must work on a machine this wrapper publishes no binary for.
  if (args.includes("--help") || args.includes("-h")) {
    console.log(helpText());
    return;
  }

  if (args.includes("--version") || args.includes("-V")) {
    console.log(`${APP_NAME.toLowerCase()} ${CLI_VERSION}`);
    return;
  }

  // The wrapper forwards no arguments to the server, so an unrecognised one was silently doing
  // nothing at all — including a misspelt `--instal`, which started a server instead.
  const unknown = args.filter((arg) => !KNOWN_FLAGS.includes(arg));
  if (unknown.length > 0) {
    console.error(`Unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(" ")}`);
    console.error(`Run \`npx ${APP_NAME.toLowerCase()} --help\` for what this wrapper accepts.`);
    process.exit(2);
  }

  // `--install` puts a double-clickable app in ~/Applications and exits. It stops a running
  // Kablan first: the swap would otherwise leave the old process serving, and the update would
  // look like it had not happened.
  if (args.includes("--uninstall")) {
    const log = createInstallLogger();
    log(`Uninstalling (wrapper ${CLI_VERSION})`);
    const { app: removed, stopped } = uninstallMacApp(log);
    log(summariseStopped(stopped));
    log(removed ? `Removed ${removed}` : `Nothing installed at ${appDir()}`);
    for (const line of describeLeftovers()) console.log(line);
    return;
  }

  fs.mkdirSync(versionCacheDir(), { recursive: true });

  if (args.includes("--install")) {
    await extractAndRun("kablan", (bin) => {
      const log = createInstallLogger();
      log(`Installing ${CLI_VERSION}`);
      const { app, stopped } = installMacApp(bin, CLI_VERSION, log);
      log(summariseStopped(stopped));
      log(`Installed ${app}`);
      console.log("\nOpen it from Launchpad or Spotlight — it starts Kablan in the background");
      console.log("and opens your browser. Logs: ~/Library/Logs/Kablan/kablan.log");
      console.log(`Install log: ${installLogPath()}`);
      console.log(
        "\nThe app updates itself: each time you open it, it runs the newest published" +
          "\nrelease. There is no update command. Finder's Get Info shows " +
          CLI_VERSION +
          "," +
          "\nwhich is the bundled copy used only when npx cannot reach the registry —" +
          "\nre-run `npx kablan@latest --install` to refresh that copy." +
          "\n\nRemove with `npx kablan --uninstall`."
      );
    });
    return;
  }

  // Non-blocking update check. Skipped in MCP mode, where stdout is a protocol stream, and in
  // local dev mode, where the binaries did not come from a release.
  if (!isMcpMode && !LOCAL_DEV_MODE) {
    getLatestVersion()
      .then((latest) => {
        if (latest && latest !== CLI_VERSION) {
          setTimeout(() => {
            console.log(`\nUpdate available: ${CLI_VERSION} -> ${latest}`);
            console.log(`Run: npx kablan@latest`);
          }, 2000);
        }
      })
      .catch(() => {});
  }

  if (isMcpMode) {
    await extractAndRun("kablan-mcp", (bin) => {
      const proc = spawn(bin, [], { stdio: "inherit" });
      proc.on("exit", (c) => process.exit(c || 0));
      proc.on("error", (e) => {
        console.error("MCP server error:", e.message);
        process.exit(1);
      });
      process.on("SIGINT", () => {
        proc.kill("SIGINT");
      });
      process.on("SIGTERM", () => proc.kill("SIGTERM"));
    });
  } else {
    const modeLabel = LOCAL_DEV_MODE ? " (local dev)" : "";
    console.log(`Starting kablan v${CLI_VERSION}${modeLabel}...`);
    await extractAndRun("kablan", (bin) => {
      if (platform === "win32") {
        execSync(`"${bin}"`, { stdio: "inherit" });
      } else {
        execSync(`"${bin}"`, { stdio: "inherit" });
      }
    });
  }
}

// Only when run as a command. Requiring this file — the tests do — must not start Kablan.
if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err.message);
    if (process.env.KABLAN_DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  });
}

module.exports = { summariseStopped, createProgressReporter, helpText, KNOWN_FLAGS };
