import { useQuery } from '@tanstack/react-query';
import { attemptsApi, sessionsApi } from '@/lib/api';
import type { WorkspaceWithSession } from '@/types/attempt';
import { createWorkspaceWithSession } from '@/types/attempt';

export const taskWorkspaceKeys = {
  all: ['taskWorkspace'] as const,
  byTask: (taskId: string | undefined) => ['taskWorkspace', taskId] as const,
};

type Options = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

/**
 * The one run belonging to a task, or `undefined` while it has never been started.
 *
 * A task has a single run, so there is nothing to pick between: this resolves the task straight
 * to the workspace the UI shows. Databases written before that rule can still hold several
 * workspaces per task; the newest one wins, which is what the old `attempts/latest` redirect
 * resolved to anyway, so an upgrade lands you on the same run you were last looking at.
 */
export function useTaskWorkspace(taskId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!taskId;

  return useQuery<WorkspaceWithSession | null>({
    queryKey: taskWorkspaceKeys.byTask(taskId),
    queryFn: async () => {
      const workspaces = await attemptsApi.getAll(taskId!);
      if (workspaces.length === 0) return null;

      const newest = [...workspaces].sort((a, b) => {
        const diff =
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return diff !== 0 ? diff : a.id.localeCompare(b.id);
      })[0];

      const sessions = await sessionsApi.getByWorkspace(newest.id);
      return createWorkspaceWithSession(newest, sessions[0]);
    },
    enabled,
    refetchInterval: opts?.refetchInterval ?? 5000,
  });
}
