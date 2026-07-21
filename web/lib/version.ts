/** Current app version (injected from package.json at build time). */
export const APP_VERSION = __APP_VERSION__;
/** owner/repo used for the update check and download links. */
export const GH_REPO = __GH_REPO__;
export const RELEASES_URL = `https://github.com/${GH_REPO}/releases`;
export const DOWNLOAD_URL = "https://amarshaked.github.io/kablan.dev/";

export interface UpdateInfo {
  latest: string;
  url: string;
}

/** Parse a version like "v1.2.3" / "1.2.3" into comparable numbers. */
function parse(v: string): number[] {
  return v
    .replace(/^v/, "")
    .split("-")[0]
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
}

/** True when `latest` is strictly newer than `current` (semver-ish). */
export function isNewer(latest: string, current: string): boolean {
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Check GitHub Releases for a newer version. Returns null when up to date,
 * when offline, or when there are no published releases yet.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GH_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tag: string = data.tag_name ?? data.name ?? "";
    if (!tag) return null;
    if (!isNewer(tag, APP_VERSION)) return null;
    return { latest: tag.replace(/^v/, ""), url: data.html_url ?? RELEASES_URL };
  } catch {
    return null;
  }
}
