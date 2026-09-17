import type { TaskWithAttemptStatus } from 'shared/types';
import { taskNeedsAttention } from '@/utils/taskActivity';

export function isWarzoneEligible(task: TaskWithAttemptStatus): boolean {
  // Terminal statuses leave the ring — Cancelled / Done is how you clear a slot.
  if (task.status === 'cancelled' || task.status === 'done') return false;
  if (task.has_in_progress_attempt) return true;
  if (taskNeedsAttention(task)) return true;
  if (task.status === 'inreview') return true;
  return false;
}

/** Lower number = higher priority for ring fill. */
export function warzonePriority(task: TaskWithAttemptStatus): number {
  if (task.has_unseen_turns && !task.has_in_progress_attempt) return 0;
  if (task.last_attempt_failed && !task.has_in_progress_attempt) return 1;
  if (task.has_in_progress_attempt) return 2;
  return 3; // inreview (and any other eligible)
}

export function sortWarzoneTasks<T extends TaskWithAttemptStatus>(
  tasks: T[]
): T[] {
  return [...tasks].sort((a, b) => {
    const pd = warzonePriority(a) - warzonePriority(b);
    if (pd !== 0) return pd;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}
