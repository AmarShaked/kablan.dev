import { useTranslation } from 'react-i18next';
import { useProject } from '@/contexts/ProjectContext';
import { useNavigateWithSearch, useTask } from '@/hooks';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { paths } from '@/lib/paths';
import type { TaskWithAttemptStatus } from 'shared/types';
import { NewCardContent } from '../ui/new-card';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { TaskNotStartedEmpty } from './TaskNotStartedEmpty';

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

  if (!task) {
    return (
      <div className="text-muted-foreground">
        {t('taskPanel.noTaskSelected')}
      </div>
    );
  }

  const titleContent = `# ${task.title || 'Task'}`;
  const descriptionContent = task.description || '';

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

          <TaskNotStartedEmpty
            taskId={task.id}
            projectId={projectId}
            initialBranch={parentWorkspace?.branch}
          />
        </div>
      </div>
    </NewCardContent>
  );
};

export default TaskPanel;
