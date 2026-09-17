import { describe, expect, it } from 'vitest';
import type { TaskWithAttemptStatus } from 'shared/types';
import { isWarzoneEligible, sortWarzoneTasks } from './eligibility';

function task(
  overrides: Partial<TaskWithAttemptStatus> & Pick<TaskWithAttemptStatus, 'id'>
): TaskWithAttemptStatus {
  return {
    has_in_progress_attempt: false,
    last_attempt_failed: false,
    has_running_dev_server: false,
    has_unseen_turns: false,
    last_turn_summary: null,
    last_turn_prompt: null,
    executor: 'CLAUDE_CODE',
    project_id: 'p1',
    title: 't',
    description: null,
    status: 'todo',
    parent_workspace_id: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    source_provider: null,
    source_id: null,
    source_identifier: null,
    source_url: null,
    ...overrides,
  };
}

describe('isWarzoneEligible', () => {
  it('includes running tasks', () => {
    expect(
      isWarzoneEligible(task({ id: '1', has_in_progress_attempt: true }))
    ).toBe(true);
  });

  it('includes needs-you (unseen, not running)', () => {
    expect(isWarzoneEligible(task({ id: '1', has_unseen_turns: true }))).toBe(
      true
    );
  });

  it('includes failed attempts', () => {
    expect(
      isWarzoneEligible(task({ id: '1', last_attempt_failed: true }))
    ).toBe(true);
  });

  it('includes inreview', () => {
    expect(isWarzoneEligible(task({ id: '1', status: 'inreview' }))).toBe(true);
  });

  it('excludes plain todo', () => {
    expect(isWarzoneEligible(task({ id: '1', status: 'todo' }))).toBe(false);
  });

  it('excludes cancelled even when still running or needing attention', () => {
    expect(
      isWarzoneEligible(
        task({
          id: '1',
          status: 'cancelled',
          has_in_progress_attempt: true,
        })
      )
    ).toBe(false);
    expect(
      isWarzoneEligible(
        task({ id: '2', status: 'cancelled', has_unseen_turns: true })
      )
    ).toBe(false);
  });

  it('excludes done', () => {
    expect(
      isWarzoneEligible(
        task({ id: '1', status: 'done', has_unseen_turns: true })
      )
    ).toBe(false);
  });
});

describe('sortWarzoneTasks', () => {
  it('orders needs-you before running before inreview', () => {
    const sorted = sortWarzoneTasks([
      task({
        id: 'r',
        has_in_progress_attempt: true,
        updated_at: '2026-01-03T00:00:00Z',
      }),
      task({ id: 'i', status: 'inreview', updated_at: '2026-01-04T00:00:00Z' }),
      task({
        id: 'n',
        has_unseen_turns: true,
        updated_at: '2026-01-02T00:00:00Z',
      }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['n', 'r', 'i']);
  });
});
