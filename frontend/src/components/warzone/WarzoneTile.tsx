import { useTranslation } from 'react-i18next';

import type { TaskAcrossProjects } from '@/hooks/useAllTasks';
import { cn } from '@/lib/utils';
import { firstLine, taskNeedsAttention } from '@/utils/taskActivity';
import { statusLabels } from '@/utils/statusLabels';

type WarzoneTileProps = {
  task: TaskAcrossProjects;
  focused?: boolean;
};

function attentionDotClass(task: TaskAcrossProjects): string | null {
  if (task.has_in_progress_attempt) return 'bg-warning';
  if (task.last_attempt_failed) return 'bg-destructive';
  if (taskNeedsAttention(task)) return 'bg-success';
  return null;
}

export function WarzoneTile({ task, focused = false }: WarzoneTileProps) {
  const { t } = useTranslation('warzone');
  const promptLine = firstLine(task.last_turn_prompt);
  const summaryLine = firstLine(task.last_turn_summary);
  const dot = attentionDotClass(task);

  return (
    <div
      className="flex min-h-0 w-full min-w-0 flex-col overflow-hidden"
      data-focused={focused || undefined}
    >
      <div className="flex justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium leading-snug">{task.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {task.projectName} · {statusLabels[task.status]}
          </div>
        </div>
        {dot && (
          <span
            className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', dot)}
            aria-hidden
          />
        )}
      </div>
      <div className="mt-1 min-h-0 space-y-0.5 overflow-hidden font-mono text-[10px] leading-snug text-muted-foreground">
        {promptLine && (
          <div className="truncate text-sky-400">
            {t('tile.you', { text: promptLine })}
          </div>
        )}
        {task.has_in_progress_attempt && <div>{t('tile.agentWorking')}</div>}
        {task.last_attempt_failed && !task.has_in_progress_attempt && (
          <div className="text-destructive">{t('tile.agentFailed')}</div>
        )}
        {summaryLine && (
          <div className="line-clamp-3">
            {t('tile.agentSummary', { text: summaryLine })}
          </div>
        )}
      </div>
    </div>
  );
}
