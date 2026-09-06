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

  return (
    <EntriesProvider key={workspace.id}>
      <RetryUiProvider attemptId={workspace.id}>
        {children({
          logs: (
            <VirtualizedList
              key={workspace.id}
              attempt={workspace}
              task={task}
            />
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
