import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { repoApi } from '@/lib/api';
import type { RepoWorkingCopy } from 'shared/types';

export const repoWorkingCopyKeys = {
  all: ['repoWorkingCopy'] as const,
  byRepo: (repoId: string) => ['repoWorkingCopy', repoId] as const,
};

/**
 * The state of each repo's own checkout. A task branches from HEAD, so uncommitted work
 * counted here is work the agent will not see, and a repo with no remote cannot produce
 * a pull request.
 *
 * Kept short-lived: someone can commit between opening the dialog and starting the task.
 */
export function useRepoWorkingCopy(repoIds: string[]) {
  const queries = useQueries({
    queries: repoIds.map((repoId) => ({
      queryKey: repoWorkingCopyKeys.byRepo(repoId),
      queryFn: () => repoApi.getWorkingCopy(repoId),
      staleTime: 5_000,
      refetchOnWindowFocus: true,
    })),
  });

  return useMemo(() => {
    const byRepo: Record<string, RepoWorkingCopy> = {};
    repoIds.forEach((repoId, idx) => {
      const data = queries[idx]?.data;
      if (data) byRepo[repoId] = data;
    });
    return byRepo;
  }, [repoIds, queries]);
}
