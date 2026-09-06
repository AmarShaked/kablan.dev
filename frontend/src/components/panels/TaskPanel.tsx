import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useNavigateWithSearch, useTask } from '@/hooks';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { useStartTask } from '@/hooks/useStartTask';
import { paths } from '@/lib/paths';
import type { TaskWithAttemptStatus } from 'shared/types';
import { NewCardContent } from '../ui/new-card';
import { Button } from '../ui/button';
import WYSIWYGEditor from '@/components/ui/wysiwyg';

interface TaskPanelProps {
  task: TaskWithAttemptStatus | null;
}

/**
 * A task that hasn't been started yet.
 *
 * There is one run per task, so this is not a list with nothing in it — it is the task, waiting.
 * Which agent and which base branch were settled when the task was written, so the only thing
 * left to do here is press the button. The numbered rows describe what pressing it does: a
 * worktree is made, an agent works in it, and you review the result.
 */
const TaskPanel = ({ task }: TaskPanelProps) => {
  const { t } = useTranslation('tasks');
  const navigate = useNavigateWithSearch();
  const { projectId } = useProject();

  const { data: parentWorkspace } = useTaskAttempt(
    task?.parent_workspace_id || undefined
  );
  const { data: parentTask } = useTask(parentWorkspace?.task_id, {
    enabled: !!parentWorkspace?.task_id,
  });

  const {
    start,
    isStarting,
    isPreparing,
    canStart,
    blocker,
    unresolvedRepos,
    error,
  } = useStartTask({
    taskId: task?.id,
    projectId,
    initialBranch: parentWorkspace?.branch,
  });

  if (!task) {
    return (
      <div className="text-muted-foreground">
        {t('taskPanel.noTaskSelected')}
      </div>
    );
  }

  const titleContent = `# ${task.title || 'Task'}`;
  const descriptionContent = task.description || '';

  const steps = [
    t('taskPanel.empty.steps.worktree'),
    t('taskPanel.empty.steps.agent'),
    t('taskPanel.empty.steps.review'),
  ];

  return (
    <NewCardContent>
      <div className="p-6 flex flex-col h-full max-h-[calc(100vh-8rem)]">
        <div className="space-y-3 overflow-y-auto flex-shrink min-h-0">
          <WYSIWYGEditor value={titleContent} disabled />
          {descriptionContent && (
            <WYSIWYGEditor value={descriptionContent} disabled />
          )}
        </div>

        <div className="mt-6 flex-shrink-0">
          {parentTask && projectId && (
            <p className="mb-6 text-sm text-muted-foreground">
              {t('taskPanel.parentTask')}{' '}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => navigate(paths.task(projectId, parentTask.id))}
              >
                {parentTask.title}
              </button>
            </p>
          )}

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
        </div>
      </div>
    </NewCardContent>
  );
};

export default TaskPanel;
