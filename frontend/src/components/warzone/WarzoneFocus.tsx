import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { Task, TaskWithAttemptStatus } from 'shared/types';

import TaskRunPanel from '@/components/panels/TaskRunPanel';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { GitOperationsProvider } from '@/contexts/GitOperationsContext';
import { ProjectProvider } from '@/contexts/ProjectContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import type { TaskAcrossProjects } from '@/hooks/useAllTasks';
import { useTask } from '@/hooks/useTask';
import { useTaskWorkspace } from '@/hooks/useTaskWorkspace';
import {
  isWarzoneMockTaskId,
  WARZONE_MOCK_CHATS,
} from '@/lib/warzone/mockTasks';
import { paths } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { statusLabels } from '@/utils/statusLabels';

type WarzoneFocusProps = {
  focusedTaskId: string | null;
  /** Full all-tasks list (not just eligible) for sticky / filtered focus. */
  tasks: TaskAcrossProjects[];
  emptyMessage?: string | null;
};

function FocusChrome({
  title,
  subtitle,
  projectId,
  taskId,
  mock,
}: {
  title: string;
  subtitle?: string;
  projectId: string;
  taskId: string;
  mock?: boolean;
}) {
  const { t } = useTranslation('warzone');
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{title}</div>
        {subtitle && (
          <div className="truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      {!mock && (
        <Link
          to={paths.task(projectId, taskId)}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {t('openTask')}
          <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function taskFromBare(task: Task): TaskWithAttemptStatus {
  return {
    ...task,
    has_in_progress_attempt: false,
    last_attempt_failed: false,
    has_running_dev_server: false,
    has_unseen_turns: false,
    last_turn_summary: null,
    last_turn_prompt: null,
    executor: '',
  };
}

export function WarzoneFocus({
  focusedTaskId,
  tasks,
  emptyMessage,
}: WarzoneFocusProps) {
  const { t } = useTranslation('warzone');
  const taskFromList = useMemo(
    () =>
      focusedTaskId ? tasks.find((t) => t.id === focusedTaskId) : undefined,
    [tasks, focusedTaskId]
  );

  const { data: fetchedTask, isLoading: isFetchLoading } = useTask(
    focusedTaskId ?? undefined,
    { enabled: !!focusedTaskId && !taskFromList && !isWarzoneMockTaskId(focusedTaskId) }
  );

  const task: TaskWithAttemptStatus | null =
    taskFromList ?? (fetchedTask ? taskFromBare(fetchedTask) : null);

  const { data: workspace, isLoading: isWorkspaceLoading } = useTaskWorkspace(
    focusedTaskId ?? undefined,
    { enabled: !!focusedTaskId && !isWarzoneMockTaskId(focusedTaskId) }
  );
  const attempt = workspace ?? undefined;

  if (!focusedTaskId) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
        {emptyMessage ?? t('selectTask')}
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
        {isFetchLoading ? t('loading') : t('taskNotFound')}
      </div>
    );
  }

  if (isWarzoneMockTaskId(focusedTaskId)) {
    const lines = WARZONE_MOCK_CHATS[focusedTaskId] ?? [];
    const across = taskFromList;
    return (
      <div className="flex h-full min-h-0 flex-col bg-muted/25">
        <FocusChrome
          title={task.title}
          subtitle={`${across?.projectName ?? 'mock'} · ${statusLabels[task.status]} · mock`}
          projectId={task.project_id}
          taskId={task.id}
          mock
        />
        <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3 font-mono text-xs leading-relaxed">
          {lines.map((line, i) => (
            <div
              key={`${line.role}-${i}`}
              className={cn(
                line.role === 'you' && 'text-sky-400',
                line.role === 'tool' &&
                  'rounded bg-muted px-2 py-1 text-muted-foreground',
                line.role === 'agent' && 'text-foreground/90'
              )}
            >
              {line.role === 'you' && `you › ${line.text}`}
              {line.role === 'agent' && `agent › ${line.text}`}
              {line.role === 'tool' && `tool · ${line.text}`}
            </div>
          ))}
        </div>
        <div className="border-t border-border p-3">
          <div className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            Reply disabled in mock mode
          </div>
        </div>
      </div>
    );
  }

  // Never-started: no conversation yet (eligible tasks almost always have a run).
  if (!isWorkspaceLoading && !attempt) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-muted/25">
        <FocusChrome
          title={task.title}
          projectId={task.project_id}
          taskId={task.id}
        />
        <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
          {t('notStarted')}
        </div>
      </div>
    );
  }

  return (
    <ProjectProvider projectId={task.project_id}>
      <GitOperationsProvider attemptId={attempt?.id}>
        <ClickedElementsProvider attempt={attempt}>
          <ReviewProvider attemptId={attempt?.id}>
            <ExecutionProcessesProvider
              attemptId={attempt?.id}
              sessionId={attempt?.session?.id}
            >
              <div className="flex h-full min-h-0 flex-col bg-muted/25">
                <FocusChrome
                  title={task.title}
                  projectId={task.project_id}
                  taskId={task.id}
                />
                <TaskRunPanel workspace={attempt} task={task}>
                  {({ logs, followUp }) => (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div className="relative flex min-h-0 flex-1 flex-col">
                        {logs}
                      </div>
                      <div className="min-h-0 max-h-[50%] shrink-0 overflow-hidden">
                        <div className="mx-auto h-full min-h-0 w-full max-w-[50rem]">
                          {followUp}
                        </div>
                      </div>
                    </div>
                  )}
                </TaskRunPanel>
              </div>
            </ExecutionProcessesProvider>
          </ReviewProvider>
        </ClickedElementsProvider>
      </GitOperationsProvider>
    </ProjectProvider>
  );
}
