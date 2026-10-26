import { useMemo } from 'react';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';

/**
 * Why the diff is empty. These are three different facts, and until now all three were reported
 * with the same sentence — "No changes have been made yet" — which only happens to be true for
 * the first one. For a run that is over, it reads as "be patient" about something that will never
 * arrive.
 */
export type EmptyDiffReason =
  /** A coding agent or script is still running. Changes may yet appear. */
  | 'running'
  /** The run is over and it failed, having committed nothing. */
  | 'failed'
  /** The run is over and it succeeded, having committed nothing. */
  | 'finished'
  /** Nothing has run on this attempt. No claim to make. */
  | 'idle';

const CODING_AGENT = 'codingagent';

export function useEmptyDiffReason(): EmptyDiffReason {
  const { executionProcessesVisible, isAttemptRunningVisible } =
    useExecutionProcessesContext();

  return useMemo(() => {
    if (isAttemptRunningVisible) return 'running';

    // Only the coding agent's own outcome is interesting here. A failed cleanup script after a
    // clean agent run is a different problem and shouldn't claim the agent changed nothing.
    const agentRuns = executionProcessesVisible.filter(
      (process) => process.run_reason === CODING_AGENT
    );
    const last = agentRuns[agentRuns.length - 1];
    if (!last) return 'idle';

    return last.status === 'failed' || last.status === 'killed'
      ? 'failed'
      : 'finished';
  }, [executionProcessesVisible, isAttemptRunningVisible]);
}

/** The `tasks` namespace key for each reason. */
export const emptyDiffReasonKeys: Record<EmptyDiffReason, string> = {
  running: 'diff.noChangesRunning',
  failed: 'diff.noChangesFailed',
  finished: 'diff.noChangesFinished',
  idle: 'diff.noChanges',
};
