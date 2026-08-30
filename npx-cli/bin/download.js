const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Where the binaries come from.
 *
 * Upstream hosted these in a Cloudflare R2 bucket whose URL was substituted in at pack time —
 * infrastructure this fork does not have, which is why `npx kablan` could never have worked by
 * renaming the package alone. They come from this repository's own GitHub release instead: one
 * artifact store, one place to look when a download fails, and no second account to keep alive.
 *
 * The tag is derived from this package's own version rather than injected, which makes it
 * impossible to publish a package pointing at binaries from a different release.
 */
const REPO = "AmarShaked/kablan.dev";
const PKG_VERSION = require("../package.json").version;
const BINARY_TAG = `v${PKG_VERSION}`;
const RELEASE_BASE = `https://github.com/${REPO}/releases/download/${BINARY_TAG}`;

const CACHE_DIR = path.join(require("os").homedir(), ".kablan", "bin");

// Local development mode: use binaries from npx-cli/dist/ instead of the release.
// Only activate if dist/ exists (i.e., running from source after local-build.sh)
const LOCAL_DIST_DIR = path.join(__dirname, "..", "dist");
const LOCAL_DEV_MODE = fs.existsSync(LOCAL_DIST_DIR) || process.env.KABLAN_LOCAL === "1";

function get(url, onResponse, reject) {
  https
    .get(url, { headers: { "User-Agent": `kablan-cli/${PKG_VERSION}` } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return get(res.headers.location, onResponse, reject);
      }
      onResponse(res);
    })
    .on("error", reject);
}

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    get(
      url,
      (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      },
      reject
    );
  });
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

async function downloadFile(url, destPath, expectedSha256, onProgress) {
  const tempPath = destPath + ".tmp";
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tempPath);
    const hash = crypto.createHash("sha256");

    const cleanup = () => {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    };

    get(
      url,
      (res) => {
        if (res.statusCode !== 200) {
          file.close();
          cleanup();
          return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        }

        const totalSize = parseInt(res.headers["content-length"], 10);
        let downloadedSize = 0;

        res.on("data", (chunk) => {
          downloadedSize += chunk.length;
          hash.update(chunk);
          if (onProgress) onProgress(downloadedSize, totalSize);
        });
        res.pipe(file);

        file.on("finish", () => {
          file.close();
          const actualSha256 = hash.digest("hex");
          if (expectedSha256 && actualSha256 !== expectedSha256) {
            cleanup();
            reject(
              new Error(`Checksum mismatch: expected ${expectedSha256}, got ${actualSha256}`)
            );
          } else {
            try {
              fs.renameSync(tempPath, destPath);
              resolve(destPath);
            } catch (err) {
              cleanup();
              reject(err);
            }
          }
        });
      },
      (err) => {
        file.close();
        cleanup();
        reject(err);
      }
    );
  });
}

/**
 * The release's checksum file, parsed into { filename: sha256 }. Fetched at most once per run.
 * A release without one still installs — the download is over HTTPS from a pinned tag — but the
 * extra check is cheap and catches a truncated or swapped asset.
 */
let checksumsPromise = null;
function getChecksums() {
  if (!checksumsPromise) {
    checksumsPromise = fetchText(`${RELEASE_BASE}/sha256sums.txt`)
      .then((text) => {
        const map = {};
        for (const line of text.split("\n")) {
          const m = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
          if (m) map[m[2]] = m[1].toLowerCase();
        }
        return map;
      })
      .catch(() => ({}));
  }
  return checksumsPromise;
}

async function ensureBinary(platform, binaryName, onProgress) {
  // In local dev mode, use binaries directly from npx-cli/dist/
  if (LOCAL_DEV_MODE) {
    const localZipPath = path.join(LOCAL_DIST_DIR, platform, `${binaryName}.zip`);
    if (fs.existsSync(localZipPath)) {
      return localZipPath;
    }
    throw new Error(
      `Local binary not found: ${localZipPath}\n` +
        `Run ./local-build.sh first to build the binaries.`
    );
  }

  const cacheDir = path.join(CACHE_DIR, BINARY_TAG, platform);
  const zipPath = path.join(cacheDir, `${binaryName}.zip`);

  if (fs.existsSync(zipPath)) return zipPath;

  fs.mkdirSync(cacheDir, { recursive: true });

  // Assets are flat on the release, so the platform is part of the name.
  const assetName = `${binaryName}-${platform}.zip`;
  const checksums = await getChecksums();

  try {
    await downloadFile(`${RELEASE_BASE}/${assetName}`, zipPath, checksums[assetName], onProgress);
  } catch (err) {
    if (/HTTP 404/.test(err.message)) {
      throw new Error(
        `${binaryName} is not published for ${platform} in ${BINARY_TAG}.\n` +
          `See https://github.com/${REPO}/releases/tag/${BINARY_TAG} for what that release contains.`
      );
    }
    throw err;
  }

  return zipPath;
}

async function getLatestVersion() {
  const release = await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`);
  return String(release.tag_name || "").replace(/^v/, "");
}

module.exports = {
  REPO,
  RELEASE_BASE,
  BINARY_TAG,
  CACHE_DIR,
  LOCAL_DEV_MODE,
  LOCAL_DIST_DIR,
  ensureBinary,
  getLatestVersion,
};
