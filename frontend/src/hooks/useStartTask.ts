import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectRepos, useRepoBranchSelection } from '@/hooks';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { attemptsApi } from '@/lib/api';
import { taskWorkspaceKeys } from '@/hooks/useTaskWorkspace';
import { workspaceSummaryKeys } from '@/components/ui-new/hooks/useWorkspaces';
import type { ExecutorProfileId, WorkspaceRepoInput } from 'shared/types';

type UseStartTaskArgs = {
  taskId: string | undefined;
  projectId: string | undefined;
  /** Base the run on this branch when the repo has it — used by subtasks. */
  initialBranch?: string | null;
  enabled?: boolean;
};

/** Why Start is unavailable, when it is — each one needs a different sentence on screen. */
export type StartBlocker = 'no-repos' | 'no-branches' | 'no-agent';

/**
 * Starts the run for a task, with no questions asked.
 *
 * Which agent and which base branch to use are settled when the task is written, so pressing
 * Start has nothing left to ask about: the configured agent, every repo on the project, and each
 * repo's own default branch. That is the whole point of the button — a task that isn't running
 * yet is one click away from running, not one dialog away.
 *
 * The one thing silence must not do is start a smaller run than asked for. Branch resolution
 * drops any repo it cannot find a branch in, so a partial resolution would quietly hand the
 * agent a subset of the project's repos. Start refuses that case and says which repos it could
 * not resolve, the same way the dialog it replaces refused to enable Create until every repo had
 * a branch.
 */
export function useStartTask({
  taskId,
  projectId,
  initialBranch,
  enabled = true,
}: UseStartTaskArgs) {
  const queryClient = useQueryClient();
  const { config } = useUserSystem();

  const { data: projectRepos = [], isLoading: isLoadingRepos } =
    useProjectRepos(projectId, { enabled });

  const {
    configs,
    isLoading: isLoadingBranches,
    getWorkspaceRepoInputs,
  } = useRepoBranchSelection({
    repos: projectRepos,
    initialBranch,
    enabled: enabled && projectRepos.length > 0,
  });

  const mutation = useMutation({
    mutationFn: ({
      profile,
      repos,
    }: {
      profile: ExecutorProfileId;
      repos: WorkspaceRepoInput[];
    }) =>
      attemptsApi.create({
        task_id: taskId!,
        executor_profile_id: profile,
        repos,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: taskWorkspaceKeys.byTask(taskId),
      });
      queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
    },
  });

  const isPreparing = isLoadingRepos || isLoadingBranches;
  const profile = config?.executor_profile ?? null;
  const unresolvedRepos = configs
    .filter((c) => c.targetBranch === null)
    .map((c) => c.repoDisplayName);

  const blocker: StartBlocker | null = isPreparing
    ? null
    : projectRepos.length === 0
      ? 'no-repos'
      : unresolvedRepos.length > 0
        ? 'no-branches'
        : !profile
          ? 'no-agent'
          : null;

  const canStart = Boolean(taskId && !isPreparing && !blocker);

  const start = useCallback(async () => {
    if (!taskId || !profile || blocker) return;
    const repos = getWorkspaceRepoInputs();
    if (repos.length !== projectRepos.length) return;
    await mutation.mutateAsync({ profile, repos });
  }, [
    taskId,
    profile,
    blocker,
    getWorkspaceRepoInputs,
    projectRepos.length,
    mutation,
  ]);

  return {
    start,
    isStarting: mutation.isPending,
    isPreparing,
    canStart,
    blocker,
    unresolvedRepos,
    error: mutation.error,
  };
}
