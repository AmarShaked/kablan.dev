/** WS/agent-stream keys for the two kinds of agent the cockpit can drive. Both share the
 * `${project}::` prefix so `useAgentStream().unreadForProject` (which matches on that prefix)
 * keeps working for worktree agents without any changes there. */

/** Key for a task force's agent — unchanged from the original cockpit convention. */
export function taskForceKey(project: string, id: string): string {
  return `${project}::${id}`;
}

/** Key for a plain worktree's agent (no task force involved). */
export function worktreeKey(project: string, worktreePath: string): string {
  return `${project}::wt:${worktreePath}`;
}
