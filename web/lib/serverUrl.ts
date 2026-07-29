import type { LogLine } from "../api.ts";

/** Find the first localhost URL a dev server printed, so it can be opened. Shared between the
 * per-branch Cockpit (Dev server card) and the cross-project Activity view — both scan the same
 * kind of stdout/stderr log lines for a `http://localhost:PORT`-shaped URL. */
export function findServerUrl(logs: LogLine[]): string | null {
  const re = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+(?:\/\S*)?/;
  for (const l of logs) {
    const m = l.text.match(re);
    if (m) return m[0].replace(/0\.0\.0\.0/, "localhost");
  }
  return null;
}
