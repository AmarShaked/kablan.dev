import { useState, type ReactNode } from 'react';
import {
  CheckSquare,
  ChevronRight,
  Eye,
  FileStack,
  Globe,
  Hammer,
  Plus,
  Search,
  SquarePen,
  Terminal,
  Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import type {
  AggregatedDiffGroup,
  AggregatedPatchGroup,
  PatchTypeWithKey,
} from '@/hooks/useConversationHistory';
import type { NormalizedEntry, TaskWithAttemptStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { cn } from '@/lib/utils';

type Group = AggregatedPatchGroup | AggregatedDiffGroup;

function actionOf(entry: PatchTypeWithKey): string | undefined {
  if (entry.type !== 'NORMALIZED_ENTRY') return undefined;
  const entryType = entry.content.entry_type;
  if (entryType.type !== 'tool_use') return undefined;
  return entryType.action_type.action;
}

function toolIcons(entries: PatchTypeWithKey[]): ReactNode[] {
  const icons: ReactNode[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const action = actionOf(entry);
    if (!action || seen.has(action)) continue;
    seen.add(action);
    const className = 'h-3 w-3 text-muted-foreground/80';
    const icon =
      action === 'file_read' ? (
        <Eye key={action} className={className} />
      ) : action === 'search' ? (
        <Search key={action} className={className} />
      ) : action === 'command_run' ? (
        <Terminal key={action} className={className} />
      ) : action === 'web_fetch' ? (
        <Globe key={action} className={className} />
      ) : action === 'todo_management' ? (
        <CheckSquare key={action} className={className} />
      ) : action === 'task_create' ? (
        <Plus key={action} className={className} />
      ) : action === 'tool' ? (
        <Wrench key={action} className={className} />
      ) : (
        <Hammer key={action} className={className} />
      );
    icons.push(icon);
    if (icons.length >= 3) break;
  }
  return icons;
}

export function CollapsedEntryGroup({
  group,
  attempt,
  task,
}: {
  group: Group;
  attempt: WorkspaceWithSession;
  task?: TaskWithAttemptStatus;
}) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const count = group.entries.length;
  const isChanges = group.type === 'AGGREGATED_DIFF_GROUP';
  const label = isChanges
    ? t('conversation.changeCount', {
        defaultValue: '{{count}} changes',
        count,
      })
    : t('conversation.toolCallCount', {
        defaultValue: '{{count}} tool calls',
        count,
      });
  const icons = isChanges
    ? [
        <SquarePen key="edit" className="h-3 w-3 text-muted-foreground/80" />,
        <FileStack key="diff" className="h-3 w-3 text-muted-foreground/80" />,
      ]
    : toolIcons(group.entries);

  return (
    <div className="px-4 py-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 text-[13px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-transform',
            open && 'rotate-90'
          )}
          aria-hidden
        />
        <span>{label}</span>
        <span className="inline-flex items-center gap-1">{icons}</span>
      </button>

      {open && (
        <div
          className={cn(
            'mt-1',
            isChanges
              ? 'flex flex-col items-start gap-1.5 pl-6'
              : 'border-l border-border pl-2'
          )}
        >
          {group.entries.map((entry) => (
            <DisplayConversationEntry
              key={entry.patchKey}
              expansionKey={entry.patchKey}
              entry={entry.content as NormalizedEntry}
              executionProcessId={entry.executionProcessId}
              taskAttempt={attempt}
              task={task}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}
