import type { TaskWithAttemptStatus } from 'shared/types';

/** Whatever the row can fit: one line, no markdown, no runaway summary. */
function firstLine(text?: string | null): string | undefined {
  const line = text
    ?.split('\n')
    .map((l) =>
      l
        .replace(/^#+\s*/, '')
        .replace(/\*\*/g, '')
        .trim()
    )
    .find(Boolean);
  if (!line) return undefined;
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
}

/**
 * The last thing that happened on a task, in one line.
 *
 * A list of tasks is a list of conversations that are each in the middle of something, and the
 * thing you want from a row is which of them is waiting on you. The description answered "what
 * is this task" — a question you only ask once — so it is the fallback rather than the line.
 *
 * Order is by recency of the state, not by importance: what is happening now, then how the last
 * run ended, then what was said.
 */
export function taskActivity(task: TaskWithAttemptStatus): string | undefined {
  if (task.has_in_progress_attempt) return 'Agent is working…';
  if (task.last_attempt_failed) return 'Attempt failed';

  const summary = firstLine(task.last_turn_summary);
  if (summary) return summary;

  // A prompt with nothing back yet: the agent has the message and has not answered.
  const prompt = firstLine(task.last_turn_prompt);
  if (prompt) return `You wrote: ${prompt}`;

  return firstLine(task.description);
}

/**
 * The agent has finished saying something and nobody has looked.
 *
 * Not while it is still working — a run in flight is its own state, and marking it unread would
 * mean every task you start is instantly shouting at you. This is the moment after: the work
 * stopped, and the row is the only thing that can say so.
 */
export function taskIsUnread(task: TaskWithAttemptStatus): boolean {
  return task.has_unseen_turns && !task.has_in_progress_attempt;
}

/**
 * The task is waiting on you — the question a list of running agents exists to answer.
 *
 * Two things count as waiting. A finished run nobody has read: the agent said its piece and
 * stopped, and until you look the row is the only trace of it — the same condition the unread dot
 * marks. And a failed attempt: it is not going to un-fail on its own, so it sits there needing a
 * decision to retry or drop it.
 *
 * A run still in flight is deliberately not here. It is working, not waiting; sweeping it in would
 * make "needs me" mean "exists", and the filter would answer nothing.
 */
export function taskNeedsAttention(task: TaskWithAttemptStatus): boolean {
  if (task.has_in_progress_attempt) return false;
  return task.last_attempt_failed || task.has_unseen_turns;
}
