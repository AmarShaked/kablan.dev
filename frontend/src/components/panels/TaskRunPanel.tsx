import type { TaskWithAttemptStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import VirtualizedList from '@/components/logs/VirtualizedList';
import { TaskFollowUpSection } from '@/components/tasks/TaskFollowUpSection';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import type { ReactNode } from 'react';

interface TaskRunPanelProps {
  workspace: WorkspaceWithSession | undefined;
  task: TaskWithAttemptStatus | null;
  children: (sections: { logs: ReactNode; followUp: ReactNode }) => ReactNode;
}

const TaskRunPanel = ({ workspace, task, children }: TaskRunPanelProps) => {
  if (!workspace) {
    return <div className="p-6 text-muted-foreground">Loading…</div>;
  }

  if (!task) {
    return <div className="p-6 text-muted-foreground">Loading task...</div>;
  }

  // While the task id has changed but the workspace query has not caught up,
  // keep the previous transcript off screen. Otherwise messages from task A
  // briefly render under task B.
  if (workspace.task_id !== task.id) {
    return <div className="p-6 text-muted-foreground">Loading…</div>;
  }

  const chatKey = `${task.id}:${workspace.id}:${workspace.session?.id ?? ''}`;

  return (
    <EntriesProvider key={chatKey}>
      <RetryUiProvider attemptId={workspace.id}>
        {children({
          logs: (
            <VirtualizedList key={chatKey} attempt={workspace} task={task} />
          ),
          followUp: (
            <TaskFollowUpSection task={task} session={workspace.session} />
          ),
        })}
      </RetryUiProvider>
    </EntriesProvider>
  );
};

export default TaskRunPanel;
