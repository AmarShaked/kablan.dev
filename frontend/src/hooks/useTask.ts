import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { Task } from 'shared/types';

// Defined with the rest of the keys; re-exported so existing imports keep working.
import { taskKeys } from '@/lib/queryKeys';
export { taskKeys };

type Options = {
  enabled?: boolean;
};

export function useTask(taskId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!taskId;

  return useQuery<Task>({
    queryKey: taskKeys.byId(taskId),
    queryFn: () => tasksApi.getById(taskId!),
    enabled,
  });
}
