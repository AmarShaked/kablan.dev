import type { TaskWithAttemptStatus } from 'shared/types';

/**
 * The stripe down the left of a task row: blue while an attempt runs, red when the last one
 * failed, and transparent otherwise — transparent rather than absent so every row keeps the same
 * width and its contents stay on one axis.
 *
 * A plain module rather than one exporting a component, so editing it does not break Fast
 * Refresh for its callers.
 */
export function taskAccentClass(task: TaskWithAttemptStatus): string {
  if (task.has_in_progress_attempt) return 'border-l-2 border-l-info';
  if (task.last_attempt_failed) return 'border-l-2 border-l-destructive';
  return 'border-l-2 border-l-transparent';
}
