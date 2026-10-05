import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { useStartTask } from '@/hooks/useStartTask';
import { Button } from '../ui/button';

type TaskNotStartedEmptyProps = {
  taskId: string | undefined;
  projectId: string | undefined;
  /** Base the run on this branch when the repo has it — used by subtasks. */
  initialBranch?: string | null;
};

/**
 * The never-started empty state: one Start button and the three steps that explain
 * what pressing it does. Shared by the task panel (no workspace yet) and the
 * conversation view (workspace exists but nothing has run).
 */
export function TaskNotStartedEmpty({
  taskId,
  projectId,
  initialBranch,
}: TaskNotStartedEmptyProps) {
  const { t } = useTranslation('tasks');

  const {
    start,
    isStarting,
    isPreparing,
    canStart,
    blocker,
    unresolvedRepos,
    error,
  } = useStartTask({
    taskId,
    projectId,
    initialBranch,
  });

  const steps = [
    t('taskPanel.empty.steps.worktree'),
    t('taskPanel.empty.steps.agent'),
    t('taskPanel.empty.steps.review'),
  ];

  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="font-ibm-plex-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {t('taskPanel.empty.eyebrow')}
      </p>
      <h2 className="mt-4 text-3xl font-medium tracking-tight">
        {t('taskPanel.empty.headline')}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        {t('taskPanel.empty.body')}
      </p>

      <Button
        className="mt-8"
        onClick={() => start()}
        disabled={!canStart || isStarting}
      >
        <Play className="mr-2 h-4 w-4" />
        {isStarting
          ? t('taskPanel.empty.starting')
          : isPreparing
            ? t('taskPanel.empty.preparing')
            : t('taskPanel.empty.start')}
      </Button>

      {blocker === 'no-repos' && (
        <p className="mt-3 text-sm text-destructive">
          {t('taskPanel.empty.noRepos')}
        </p>
      )}
      {blocker === 'no-branches' && (
        <p className="mt-3 text-sm text-destructive">
          {t('taskPanel.empty.noBranches', {
            repos: unresolvedRepos.join(', '),
          })}
        </p>
      )}
      {blocker === 'no-agent' && (
        <p className="mt-3 text-sm text-destructive">
          {t('taskPanel.empty.noAgent')}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-destructive">
          {t('taskPanel.empty.error')}
        </p>
      )}

      <ol className="mt-12 border-t border-border text-left">
        {steps.map((step, i) => (
          <li
            key={step}
            className="flex items-baseline gap-4 border-b border-border py-3"
          >
            <span className="font-ibm-plex-mono text-[11px] tabular-nums text-muted-foreground">
              {String(i + 1).padStart(3, '0')}
            </span>
            <span className="text-sm">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
