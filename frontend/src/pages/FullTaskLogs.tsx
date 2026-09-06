// VS Code webview integration - install keyboard/clipboard bridge
import '@/vscode/bridge';

import { useParams } from 'react-router-dom';
import { AppWithStyleOverride } from '@/utils/StyleOverride';
import { WebviewContextMenu } from '@/vscode/ContextMenu';
import TaskRunPanel from '@/components/panels/TaskRunPanel';
import { useTaskWorkspace } from '@/hooks/useTaskWorkspace';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';

export function FullTaskLogsPage() {
  const { projectId = '', taskId = '' } = useParams<{
    projectId: string;
    taskId: string;
  }>();

  const { data: workspace } = useTaskWorkspace(taskId);
  const { tasksById } = useProjectTasks(projectId);
  const task = taskId ? (tasksById[taskId] ?? null) : null;

  const body = (
    <TaskRunPanel workspace={workspace ?? undefined} task={task}>
      {({ logs, followUp }) => (
        <div className="h-full min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col">{logs}</div>
          <div className="min-h-0 max-h-[50%] border-t overflow-hidden">
            <div className="mx-auto w-full max-w-[50rem] h-full min-h-0">
              {followUp}
            </div>
          </div>
        </div>
      )}
    </TaskRunPanel>
  );

  return (
    <AppWithStyleOverride>
      <div className="h-screen flex flex-col bg-muted">
        <WebviewContextMenu />

        <main className="flex-1 min-h-0">
          {workspace ? (
            <ClickedElementsProvider attempt={workspace}>
              <ReviewProvider key={workspace.id}>
                <ExecutionProcessesProvider
                  key={workspace.id}
                  attemptId={workspace.id}
                  sessionId={workspace.session?.id}
                >
                  {body}
                </ExecutionProcessesProvider>
              </ReviewProvider>
            </ClickedElementsProvider>
          ) : (
            body
          )}
        </main>
      </div>
    </AppWithStyleOverride>
  );
}
