import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';

import { projectStatsApi, tasksApi } from '@/lib/api';
import type { ArchiveFilter, TaskWithAttemptStatus } from 'shared/types';
import { projectKeys, taskKeys } from '@/lib/queryKeys';

export type TaskAcrossProjects = TaskWithAttemptStatus & {
  projectId: string;
  projectName: string;
  /** The project's Lucide icon key, so a row can wear the same mark as the sidebar. */
  projectIcon: string | null;
};

/**
 * Every task in every project.
 *
 * Fanned out per project rather than fetched in one call: the API has no all-projects endpoint,
 * and adding one to serve a single screen would mean a route, a query and a type for something
 * these requests already answer. They share the cache with each project's own board, so opening
 * a project after this page is served from memory.
 *
 * The cost is a request per project, which is fine at the scale a person keeps projects — if that
 * stops being true, this is the seam where one endpoint would replace the fan-out.
 */
export function useAllTasks(archived: ArchiveFilter = 'active') {
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: projectKeys.withStats,
    queryFn: projectStatsApi.listWithStats,
  });

  const results = useQueries({
    queries: projects.map((project) => ({
      // The filter is part of the key: the archived listing and the active one are different
      // answers, and caching them together would show one where the other was asked for.
      queryKey: taskKeys.byProjectFiltered(project.id, archived),
      queryFn: () => tasksApi.listByProject(project.id, archived),
      staleTime: 15_000,
    })),
  });

  const tasks = useMemo<TaskAcrossProjects[]>(
    () =>
      projects.flatMap((project, i) =>
        (results[i]?.data ?? []).map((task) => ({
          ...task,
          projectId: project.id,
          projectName: project.name,
          projectIcon: project.icon,
        }))
      ),
    [projects, results]
  );

  return {
    tasks,
    projectCount: projects.length,
    isLoading: projectsLoading || results.some((r) => r.isLoading),
  };
}
