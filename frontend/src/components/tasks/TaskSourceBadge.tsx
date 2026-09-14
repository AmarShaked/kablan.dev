import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type TaskSourceFields = {
  source_provider?: string | null;
  source_identifier?: string | null;
  source_url?: string | null;
};

/**
 * A Linear (later: Jira, …) identifier that opens the original ticket.
 *
 * Shown beside activity pills so a task started from a tracker still names that ticket
 * without taking a line of its own.
 */
export function TaskSourceBadge({
  task,
  className,
}: {
  task: TaskSourceFields;
  className?: string;
}) {
  if (task.source_provider !== 'linear' || !task.source_identifier) {
    return null;
  }

  const pill = (
    <span
      className={cn(
        'font-ibm-plex-mono inline-flex shrink-0 items-center gap-1 bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground',
        className
      )}
    >
      {task.source_identifier}
      {task.source_url ? (
        <ArrowUpRight className="h-3 w-3" aria-hidden />
      ) : null}
    </span>
  );

  if (!task.source_url) return pill;

  return (
    <a
      href={task.source_url}
      target="_blank"
      rel="noreferrer"
      title={`Open ${task.source_identifier} in Linear`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="hover:text-foreground"
    >
      {pill}
    </a>
  );
}
