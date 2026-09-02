import type { TaskWithAttemptStatus } from 'shared/types';
import { cn } from '@/lib/utils';

const PILL =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-1.5 py-px text-[11px] leading-4 group-hover/row:bg-muted';

function Dot({ className, pulse }: { className: string; pulse?: boolean }) {
  return (
    <span className="relative flex h-1.5 w-1.5">
      {pulse && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 motion-reduce:animate-none',
            className
          )}
        />
      )}
      <span
        className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', className)}
      />
    </span>
  );
}

/**
 * What is true of a task right now, as pills at the end of its row.
 *
 * They queue rather than compete: a task can be failing and unread, or working with a dev server
 * up, and each of those is one more pill instead of a rule about which mark wins a single slot.
 * The order is fixed — what is happening, then what you have not seen, then what is merely on —
 * so the same state lands in the same place in every row.
 *
 * Nothing here repeats the task's status: that is the ring at the other end of the row, which is
 * also the control for changing it.
 */
export function TaskStatePills({
  task,
  className,
}: {
  task: TaskWithAttemptStatus;
  className?: string;
}) {
  const unread = task.has_unseen_turns && !task.has_in_progress_attempt;
  if (
    !task.has_in_progress_attempt &&
    !task.last_attempt_failed &&
    !task.has_running_dev_server &&
    !unread
  ) {
    return null;
  }

  return (
    <span className={cn('flex shrink-0 items-center gap-1', className)}>
      {task.has_in_progress_attempt && (
        <span
          className={cn(PILL, 'border-success/35 text-success')}
          title="An agent is working on this task"
        >
          <Dot className="bg-success" pulse />
          Working
        </span>
      )}
      {task.last_attempt_failed && !task.has_in_progress_attempt && (
        <span
          className={cn(PILL, 'border-destructive/35 text-destructive')}
          title="The last attempt for this task failed"
        >
          Failed
        </span>
      )}
      {unread && (
        <span
          className={cn(PILL, 'border-info/35 text-info')}
          title="The agent has finished and you have not looked yet"
        >
          New
        </span>
      )}
      {task.has_running_dev_server && (
        <span
          className={cn(PILL, 'text-muted-foreground')}
          title="A dev server is running for this task"
        >
          Server
        </span>
      )}
    </span>
  );
}
