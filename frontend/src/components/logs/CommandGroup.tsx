import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import type { AggregatedPatchGroup } from '@/hooks/useConversationHistory';
import type { NormalizedEntry, TaskWithAttemptStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { cn } from '@/lib/utils';

/**
 * A run of shell commands, as one line.
 *
 * Collapsed by default: the count is almost always the whole story, and the commands themselves
 * are long absolute paths that wrap over two lines each. Opening keeps the real rows — the same
 * component, the same output, the same expand-for-details — so nothing is lost by folding them.
 */
export function CommandGroup({
  group,
  attempt,
  task,
}: {
  group: AggregatedPatchGroup;
  attempt: WorkspaceWithSession;
  task?: TaskWithAttemptStatus;
}) {
  const [open, setOpen] = useState(false);
  const count = group.entries.length;

  return (
    <div className="px-4 py-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-sm text-muted-foreground/70 transition-colors hover:text-muted-foreground"
      >
        <span>
          Ran {count} command{count === 1 ? '' : 's'}
        </span>
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 transition-transform',
            open && 'rotate-90'
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-1 border-l border-border pl-2">
          {group.entries.map((entry) => (
            <DisplayConversationEntry
              key={entry.patchKey}
              expansionKey={entry.patchKey}
              entry={entry.content as NormalizedEntry}
              executionProcessId={entry.executionProcessId}
              taskAttempt={attempt}
              task={task}
            />
          ))}
        </div>
      )}
    </div>
  );
}
