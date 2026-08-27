import { Loader2, XCircle } from 'lucide-react';

import type { TaskWithAttemptStatus } from 'shared/types';

/**
 * "Is this task doing anything right now?"
 *
 * When you're running several agents at once that's the question you scan for, and the previous
 * treatment — a 16px spinner tucked beside the actions menu — didn't answer it at a glance. This
 * is a labelled pill instead, so running and failed read as states rather than as icons you have
 * to notice.
 *
 * Shared by the board card and the list row so the two can't drift apart.
 */
export function TaskActivityBadge({ task }: { task: TaskWithAttemptStatus }) {
  if (task.has_in_progress_attempt) {
    return (
      <span
        className="font-ibm-plex-mono inline-flex shrink-0 items-center gap-1 bg-info/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-info"
        title="An attempt is running for this task"
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Running
      </span>
    );
  }

  if (task.last_attempt_failed) {
    return (
      <span
        className="font-ibm-plex-mono inline-flex shrink-0 items-center gap-1 bg-destructive/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-destructive"
        title="The last attempt for this task failed"
      >
        <XCircle className="h-3 w-3" aria-hidden />
        Failed
      </span>
    );
  }

  return null;
}

/** True when the task is worth marking out in a list — used for the row/card edge stripe. */
export function taskAccentClass(task: TaskWithAttemptStatus): string {
  if (task.has_in_progress_attempt) return 'border-l-2 border-l-info';
  if (task.last_attempt_failed) return 'border-l-2 border-l-destructive';
  return 'border-l-2 border-l-transparent';
}
