import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ExecutionProcess } from 'shared/types';
import { emptyDiffReasonKeys, useEmptyDiffReason } from './useEmptyDiffReason';

const context = vi.hoisted(() => ({
  executionProcessesVisible: [] as ExecutionProcess[],
  isAttemptRunningVisible: false,
}));

vi.mock('@/contexts/ExecutionProcessesContext', () => ({
  useExecutionProcessesContext: () => context,
}));

const process = (run_reason: string, status: string): ExecutionProcess =>
  ({ run_reason, status }) as unknown as ExecutionProcess;

const reasonFor = (processes: ExecutionProcess[], running = false) => {
  context.executionProcessesVisible = processes;
  context.isAttemptRunningVisible = running;
  return renderHook(() => useEmptyDiffReason()).result.current;
};

describe('useEmptyDiffReason', () => {
  it('says nothing has run when nothing has run', () => {
    expect(reasonFor([])).toBe('idle');
  });

  it('is running while the agent is working', () => {
    expect(reasonFor([process('codingagent', 'running')], true)).toBe(
      'running'
    );
  });

  // The bug this exists for: a finished, empty run used to read "No changes have been made yet",
  // which tells the user to wait for something that is never coming.
  it('separates a failed empty run from a successful one', () => {
    expect(reasonFor([process('codingagent', 'failed')])).toBe('failed');
    expect(reasonFor([process('codingagent', 'completed')])).toBe('finished');
  });

  it('treats a killed run as failed', () => {
    expect(reasonFor([process('codingagent', 'killed')])).toBe('failed');
  });

  it('reads the latest agent run, not the first', () => {
    expect(
      reasonFor([
        process('codingagent', 'failed'),
        process('codingagent', 'completed'),
      ])
    ).toBe('finished');
  });

  // A cleanup script failing after a clean agent run is a different problem, and shouldn't make
  // the diff pane claim the agent changed nothing.
  it('ignores non-agent processes', () => {
    expect(
      reasonFor([
        process('codingagent', 'completed'),
        process('cleanupscript', 'failed'),
      ])
    ).toBe('finished');
    expect(reasonFor([process('setupscript', 'failed')])).toBe('idle');
  });

  it('has a distinct string for every reason', () => {
    const keys = Object.values(emptyDiffReasonKeys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
