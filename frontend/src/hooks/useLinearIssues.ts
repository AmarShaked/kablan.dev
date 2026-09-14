import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import { linearApi, type LinearIssueListParams } from '@/lib/api';
import { mapApiLinearIssue, getNextLinearPageParam } from '@/lib/integrations/linear';
import {
  linearIssuesQueryParams,
  type LinearFilters,
} from '@/lib/integrations/linearFilters';

export const linearQueryKeys = {
  all: ['linear'] as const,
  meta: ['linear', 'meta'] as const,
  issues: (filters: LinearFilters) =>
    ['linear', 'issues', filters] as const,
};

export function useLinearMeta(enabled: boolean) {
  return useQuery({
    queryKey: linearQueryKeys.meta,
    queryFn: () => linearApi.meta(),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useLinearIssuesInfinite(
  filters: LinearFilters,
  enabled: boolean
) {
  const params = linearIssuesQueryParams(filters);

  return useInfiniteQuery({
    queryKey: linearQueryKeys.issues(filters),
    queryFn: ({ pageParam }) =>
      linearApi.listIssues({
        ...params,
        after: pageParam,
        first: 25,
      } satisfies LinearIssueListParams),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: getNextLinearPageParam,
    staleTime: 60_000,
    enabled,
    select: (data) => ({
      ...data,
      issues: data.pages.flatMap((page) =>
        page.issues.map(mapApiLinearIssue)
      ),
      viewer: data.pages[0]?.viewer ?? null,
      totalCount: data.pages[0]?.total_count ?? null,
    }),
  });
}

export function useInvalidateLinearQueries() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: linearQueryKeys.all });
}
