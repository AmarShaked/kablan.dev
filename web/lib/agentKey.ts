/** WS/agent-stream key for a branch's owned agent — shares the `${project}::` prefix with
 * `useAgentStream().unreadForProject` (which matches on that prefix), and must exactly match
 * the backend's `branch_agent_key` (see `src-tauri/src/lib.rs`) since it's also the process
 * registry key. Branch names contain `/`, which is fine here — this key is never itself used
 * as a URL path segment (branch always travels in the request body/query instead). */
export function branchKey(project: string, branch: string): string {
  return `${project}::branch:${branch}`;
}

const DELIM = "::branch:";

/** Inverse of `branchKey` — splits on the FIRST occurrence of the delimiter only, since branch
 * names may themselves contain `/` (never `::branch:`, so this is unambiguous). Returns null for
 * keys that don't look like a branch key at all (defensive — callers iterating `snapshotStatuses()`
 * may see keys from unrelated future features). */
export function parseBranchKey(key: string): { project: string; branch: string } | null {
  const i = key.indexOf(DELIM);
  if (i === -1) return null;
  return { project: key.slice(0, i), branch: key.slice(i + DELIM.length) };
}
