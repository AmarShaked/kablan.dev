import { describe, expect, it } from 'vitest';

import { taskActivity, taskIsUnread, taskNeedsAttention } from './taskActivity';
import type { TaskWithAttemptStatus } from 'shared/types';

/** A task with nothing going on; each test turns on the one thing it is about. */
function task(
  over: Partial<TaskWithAttemptStatus> = {}
): TaskWithAttemptStatus {
  return {
    id: 'id',
    project_id: 'project',
    title: 'A task',
    description: null,
    status: 'inprogress',
    parent_workspace_id: null,
    archived_at: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    has_in_progress_attempt: false,
    last_attempt_failed: false,
    has_running_dev_server: false,
    has_unseen_turns: false,
    last_turn_summary: null,
    last_turn_prompt: null,
    executor: 'CLAUDE_CODE',
    ...over,
  } as TaskWithAttemptStatus;
}

describe('taskActivity', () => {
  it('reports the run in flight before anything it has said', () => {
    expect(
      taskActivity(
        task({
          has_in_progress_attempt: true,
          last_turn_summary: 'Older news',
        })
      )
    ).toBe('Agent is working…');
  });

  it('reports a failure once nothing is running', () => {
    expect(taskActivity(task({ last_attempt_failed: true }))).toBe(
      'Run failed'
    );
  });

  it("uses the agent's own last words when it is idle", () => {
    expect(
      taskActivity(task({ last_turn_summary: 'Renamed it and updated tests.' }))
    ).toBe('Renamed it and updated tests.');
  });

  it('falls back to the prompt when the agent has not answered', () => {
    expect(
      taskActivity(task({ last_turn_prompt: 'handle the empty state' }))
    ).toBe('You wrote: handle the empty state');
  });

  it('falls back to the description when there is no conversation', () => {
    expect(taskActivity(task({ description: 'Some background' }))).toBe(
      'Some background'
    );
  });

  it('is a single plain line', () => {
    expect(
      taskActivity(
        task({ last_turn_summary: '## Done\n\n**1,034 packages** installed' })
      )
    ).toBe('Done');
    expect(
      taskActivity(task({ last_turn_summary: 'x'.repeat(200) }))
    ).toHaveLength(160);
  });

  it('says nothing when there is nothing to say', () => {
    expect(taskActivity(task())).toBeUndefined();
  });
});

describe('taskIsUnread', () => {
  it('marks a finished run nobody has looked at', () => {
    expect(taskIsUnread(task({ has_unseen_turns: true }))).toBe(true);
  });

  it('does not mark a run that is still going', () => {
    // Otherwise every task you start would immediately shout at you.
    expect(
      taskIsUnread(
        task({ has_unseen_turns: true, has_in_progress_attempt: true })
      )
    ).toBe(false);
  });

  it('does not mark a task whose turns are seen', () => {
    expect(taskIsUnread(task())).toBe(false);
  });
});

describe('taskNeedsAttention', () => {
  it('flags a failed attempt: it needs a decision to retry or drop', () => {
    expect(taskNeedsAttention(task({ last_attempt_failed: true }))).toBe(true);
  });

  it('flags a finished run nobody has read', () => {
    expect(taskNeedsAttention(task({ has_unseen_turns: true }))).toBe(true);
  });

  it('does not flag a run still in flight', () => {
    // "Needs me" would mean "exists" if working tasks counted; a working task is not waiting.
    expect(
      taskNeedsAttention(
        task({ has_unseen_turns: true, has_in_progress_attempt: true })
      )
    ).toBe(false);
    expect(
      taskNeedsAttention(
        task({ last_attempt_failed: true, has_in_progress_attempt: true })
      )
    ).toBe(false);
  });

  it('does not flag a quiet task with nothing waiting', () => {
    expect(taskNeedsAttention(task())).toBe(false);
  });
});
