/** WS/agent-stream key for a branch's owned agent — shares the `${project}::` prefix with
 * `useAgentStream().unreadForProject` (which matches on that prefix), and must exactly match
 * the backend's `branch_agent_key` (see `src-tauri/src/lib.rs`) since it's also the process
 * registry key. Branch names contain `/`, which is fine here — this key is never itself used
 * as a URL path segment (branch always travels in the request body/query instead). */
export function branchKey(project: string, branch: string): string {
  return `${project}::branch:${branch}`;
}
