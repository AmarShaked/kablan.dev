import { useQuery } from '@tanstack/react-query';

import { tagsApi } from '@/lib/api';
import type { Tag } from 'shared/types';

export const projectTagKeys = {
  byProject: (projectId?: string) => ['tags', 'byProject', projectId] as const,
};

/**
 * The tags usable in a project: its own, plus the ones that belong to no project.
 *
 * The same list the composer's `@` typeahead draws from, so a snippet is one thing with two ways
 * in — type its name, or pick it from the menu.
 */
export function useProjectTags(projectId?: string | null) {
  return useQuery<Tag[]>({
    queryKey: projectTagKeys.byProject(projectId ?? undefined),
    queryFn: () => tagsApi.list({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 60_000,
  });
}
