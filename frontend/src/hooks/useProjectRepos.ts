import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { Repo } from 'shared/types';
import { repoKeys } from '@/lib/queryKeys';

type Options = {
  enabled?: boolean;
};

export function useProjectRepos(projectId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!projectId;

  return useQuery<Repo[]>({
    queryKey: repoKeys.byProject(projectId),
    queryFn: () => projectsApi.getRepositories(projectId!),
    enabled,
  });
}
