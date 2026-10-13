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
import { RouteRecovery } from '@/components/routing/RouteRecovery';

export function FullTaskLogsPage() {
  const { projectId = '', taskId = '' } = useParams<{
    projectId: string;
    taskId: string;
  }>();

  const { data: workspace } = useTaskWorkspace(taskId);
  const { tasksById, isLoading: tasksLoading } = useProjectTasks(projectId);
  const task = taskId ? (tasksById[taskId] ?? null) : null;

  // This route sits outside the app shell (the VS Code logs view). A missing task used to
  // spin on "Loading…" with no link out, so you could not open another task or project.
  if (!tasksLoading && taskId && !task) {
    return (
      <AppWithStyleOverride>
        <div className="flex h-screen items-center justify-center bg-background">
          <RouteRecovery
            title="This task doesn't exist"
            detail="It may have been deleted. Open the project's tasks, or pick another project."
          />
        </div>
      </AppWithStyleOverride>
    );
  }

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
