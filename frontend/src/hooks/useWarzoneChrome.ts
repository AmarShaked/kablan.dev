import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { useAllTasks } from '@/hooks/useAllTasks';
import { projectStatsApi } from '@/lib/api';
import { projectKeys } from '@/lib/queryKeys';
import { isWarzoneEligible, sortWarzoneTasks } from '@/lib/warzone/eligibility';
import {
  WARZONE_MOCK_PROJECT_CHIPS,
  WARZONE_MOCK_TASKS,
} from '@/lib/warzone/mockTasks';
import {
  assignStableSlots,
  parseWarzoneLayout,
  warzoneLayout,
} from '@/lib/warzone/slots';
import { taskNeedsAttention } from '@/utils/taskActivity';

/** Shared Warzone header chrome: project chips + status from URL + cached task lists. */
export function useWarzoneChrome() {
  const [params, setParams] = useSearchParams();
  const mockMode = params.get('mock') === '1';
  const projectFilter = params.get('project');
  const layoutId = parseWarzoneLayout(params.get('layout'));
  const slotCount = warzoneLayout(layoutId).slotCount;

  const { tasks: liveTasks } = useAllTasks('active');
  const { data: liveProjects = [] } = useQuery({
    queryKey: projectKeys.withStats,
    queryFn: projectStatsApi.listWithStats,
    enabled: !mockMode,
  });

  const tasks = mockMode ? WARZONE_MOCK_TASKS : liveTasks;
  const projects = mockMode
    ? WARZONE_MOCK_PROJECT_CHIPS
    : liveProjects.map((p) => ({ id: p.id, name: p.name }));

  const eligible = useMemo(() => {
    const filtered = projectFilter
      ? tasks.filter((t) => t.projectId === projectFilter)
      : tasks;
    return sortWarzoneTasks(filtered.filter(isWarzoneEligible));
  }, [tasks, projectFilter]);

  const eligibleIds = useMemo(() => eligible.map((t) => t.id), [eligible]);

  const overflow = useMemo(
    () =>
      assignStableSlots({
        eligibleIds,
        previous: new Map(),
        slotCount,
      }).overflow,
    [eligibleIds, slotCount]
  );

  const needsYouCount = useMemo(
    () => eligible.filter(taskNeedsAttention).length,
    [eligible]
  );

  const onSelectProject = (id: string | null) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('project', id);
        else next.delete('project');
        return next;
      },
      { replace: true }
    );
  };

  return {
    projects,
    projectFilter,
    needsYouCount,
    overflow,
    mockMode,
    onSelectProject,
  };
}
