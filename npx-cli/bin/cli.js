#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const AdmZip = require("adm-zip");
const path = require("path");
const fs = require("fs");
const { ensureBinary, BINARY_TAG, CACHE_DIR, LOCAL_DEV_MODE, LOCAL_DIST_DIR, getLatestVersion } = require("./download");
const { installMacApp, uninstallMacApp, appDir } = require("./install-app");

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

const platformDir = getPlatformDir();
// In local dev mode, extract directly to dist directory; otherwise use global cache
const versionCacheDir = LOCAL_DEV_MODE
  ? path.join(LOCAL_DIST_DIR, platformDir)
  : path.join(CACHE_DIR, BINARY_TAG, platformDir);

function showProgress(downloaded, total) {
  const percent = total ? Math.round((downloaded / total) * 100) : 0;
  const mb = (downloaded / (1024 * 1024)).toFixed(1);
  const totalMb = total ? (total / (1024 * 1024)).toFixed(1) : "?";
  process.stderr.write(`\r   Downloading: ${mb}MB / ${totalMb}MB (${percent}%)`);
}

async function extractAndRun(baseName, launch) {
  const binName = getBinaryName(baseName);
  const binPath = path.join(versionCacheDir, binName);
  const zipPath = path.join(versionCacheDir, `${baseName}.zip`);

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
    try {
      await ensureBinary(platformDir, baseName, showProgress);
      console.error(""); // newline after progress
    } catch (err) {
      console.error(`\nDownload failed: ${err.message}`);
      process.exit(1);
    }
  }

  // Extract
  if (!fs.existsSync(binPath)) {
    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(versionCacheDir, true);
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

async function main() {
  fs.mkdirSync(versionCacheDir, { recursive: true });

  const args = process.argv.slice(2);
  const isMcpMode = args.includes("--mcp");

  // `--install` puts a double-clickable app in ~/Applications and exits. It stops a running
  // Kablan first: the swap would otherwise leave the old process serving, and the update would
  // look like it had not happened.
  if (args.includes("--uninstall")) {
    const { app: removed, stoppedPid } = uninstallMacApp();
    if (stoppedPid) console.log(`Stopped the running Kablan (pid ${stoppedPid})`);
    console.log(removed ? `Removed ${removed}` : `Nothing installed at ${appDir()}`);
    console.log("Cached binaries are still in ~/.kablan/bin; delete that to reclaim the space.");
    return;
  }

  if (args.includes("--install")) {
    await extractAndRun("kablan", (bin) => {
      const { app, stoppedPid } = installMacApp(bin, CLI_VERSION);
      if (stoppedPid) {
        console.log(`\nStopped the running Kablan (pid ${stoppedPid}) so this version replaces it`);
      }
      console.log(`\nInstalled ${app}`);
      console.log("Open it from Launchpad or Spotlight — it starts Kablan in the background");
      console.log("and opens your browser. Logs: ~/Library/Logs/Kablan/kablan.log");
      console.log("\nUpdate with `npx kablan@latest --install`, remove with `npx kablan --uninstall`.");
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

main().catch((err) => {
  console.error("Fatal error:", err.message);
  if (process.env.KABLAN_DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
