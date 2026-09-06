import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  GitBranch as GitBranchIcon,
  RefreshCw,
  Settings,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx';
import { useCallback, useMemo, useState } from 'react';
import type { RepoBranchStatus, Merge, Workspace } from 'shared/types';
import { ChangeTargetBranchDialog } from '@/components/dialogs/tasks/ChangeTargetBranchDialog';
import RepoSelector from '@/components/tasks/RepoSelector';
import { RebaseDialog } from '@/components/dialogs/tasks/RebaseDialog';
import { useTranslation } from 'react-i18next';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useGitOperations } from '@/hooks/useGitOperations';
import { useRepoBranches } from '@/hooks';
import { BranchStatusChips } from './BranchStatus';

interface GitOperationsProps {
  selectedAttempt: Workspace;
  branchStatus: RepoBranchStatus[] | null;
  branchStatusError?: Error | null;
  isAttemptRunning: boolean;
  selectedBranch: string | null;
  layout?: 'horizontal' | 'vertical';
}

export type GitOperationsInputs = Omit<GitOperationsProps, 'selectedAttempt'>;

/**
 * Wraps a git action so its tooltip works even while the button is disabled — a disabled button
 * receives no pointer events, so the trigger has to be the span around it.
 */
function ActionTooltip({
  reason,
  children,
}: {
  /** Why the action is unavailable, or null when it is available. */
  reason: string | null;
  children: React.ReactNode;
}) {
  if (!reason) return <>{children}</>;
  return (
    // Brings its own provider: this file's other one covers the branch chips only, and a
    // component that needs a provider should not depend on where it happens to be placed.
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="shrink-0" tabIndex={0}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs px-2 py-1 text-xs">
          {reason}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function GitOperations({
  selectedAttempt,
  branchStatus,
  branchStatusError,
  isAttemptRunning,
  selectedBranch,
  layout = 'horizontal',
}: GitOperationsProps) {
  const { t } = useTranslation('tasks');

  const { repos, selectedRepoId, setSelectedRepoId } = useAttemptRepo(
    selectedAttempt.id
  );
  const git = useGitOperations(selectedAttempt.id, selectedRepoId ?? undefined);
  const { data: branches = [] } = useRepoBranches(selectedRepoId);
  const isChangingTargetBranch = git.states.changeTargetBranchPending;

  // Local state for git operations
  const [merging, setMerging] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [rebasing, setRebasing] = useState(false);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  // Target branch change handlers
  const handleChangeTargetBranchClick = async (newBranch: string) => {
    const repoId = getSelectedRepoId();
    if (!repoId) return;
    await git.actions.changeTargetBranch({
      newTargetBranch: newBranch,
      repoId,
    });
  };

  const handleChangeTargetBranchDialogOpen = async () => {
    try {
      const result = await ChangeTargetBranchDialog.show({
        branches,
        isChangingTargetBranch: isChangingTargetBranch,
      });

      if (result.action === 'confirmed' && result.branchName) {
        await handleChangeTargetBranchClick(result.branchName);
      }
    } catch (error) {
      // User cancelled - do nothing
    }
  };

  const getSelectedRepoId = useCallback(() => {
    return selectedRepoId ?? repos[0]?.id;
  }, [selectedRepoId, repos]);

  const getSelectedRepoStatus = useCallback(() => {
    const repoId = getSelectedRepoId();
    return branchStatus?.find((r) => r.repo_id === repoId);
  }, [branchStatus, getSelectedRepoId]);

  // Memoize the selected repo status for use in button disabled states
  const selectedRepoStatus = useMemo(
    () => getSelectedRepoStatus(),
    [getSelectedRepoStatus]
  );

  const hasConflictsCalculated =
    (selectedRepoStatus?.conflicted_files?.length ?? 0) > 0;

  const commitsAhead = selectedRepoStatus?.commits_ahead ?? 0;
  const remoteAhead = selectedRepoStatus?.remote_commits_ahead ?? 0;
  // How many commits the remote has that this branch does not — what a pull would bring.
  const remoteBehind = selectedRepoStatus?.remote_commits_behind ?? 0;
  const recentlyActed = pushSuccess || mergeSuccess;

  // Memoize merge status information to avoid repeated calculations
  const mergeInfo = useMemo(() => {
    const selectedRepoStatus = getSelectedRepoStatus();
    if (!selectedRepoStatus?.merges)
      return {
        hasOpenPR: false,
        openPR: null,
        hasMergedPR: false,
        mergedPR: null,
        hasMerged: false,
        latestMerge: null,
      };

    const openPR = selectedRepoStatus.merges.find(
      (m: Merge) => m.type === 'pr' && m.pr_info.status === 'open'
    );

    const mergedPR = selectedRepoStatus.merges.find(
      (m: Merge) => m.type === 'pr' && m.pr_info.status === 'merged'
    );

    const merges = selectedRepoStatus.merges.filter(
      (m: Merge) =>
        m.type === 'direct' ||
        (m.type === 'pr' && m.pr_info.status === 'merged')
    );

    return {
      hasOpenPR: !!openPR,
      openPR,
      hasMergedPR: !!mergedPR,
      mergedPR,
      hasMerged: merges.length > 0,
      latestMerge: selectedRepoStatus.merges[0] || null, // Most recent merge
    };
  }, [getSelectedRepoStatus]);

  const mergeButtonLabel = useMemo(() => {
    if (mergeSuccess) return t('git.states.merged');
    if (merging) return t('git.states.merging');
    return t('git.states.merge');
  }, [mergeSuccess, merging, t]);

  const rebaseButtonLabel = useMemo(() => {
    if (rebasing) return t('git.states.rebasing');
    return t('git.states.rebase');
  }, [rebasing, t]);

  const pullButtonLabel = useMemo(() => {
    if (pulling) return t('git.states.pulling', 'Pulling…');
    // The count is the reason the button is there, so it is on the button.
    return t('git.states.pullCount', 'Pull {{count}}', { count: remoteBehind });
  }, [pulling, remoteBehind, t]);

  const pushButtonLabel = useMemo(() => {
    return pushSuccess
      ? t('git.states.pushed')
      : pushing
        ? t('git.states.pushing')
        : t('git.states.push');
  }, [pushSuccess, pushing, t]);

  const handlePullClick = async () => {
    const repoId = getSelectedRepoId();
    if (!repoId) return;
    try {
      setPulling(true);
      await git.actions.pull({ repo_id: repoId });
    } finally {
      setPulling(false);
    }
  };

  const handleMergeClick = async () => {
    // Directly perform merge without checking branch status
    await performMerge();
  };

  const handlePushClick = async () => {
    try {
      setPushing(true);
      const repoId = getSelectedRepoId();
      if (!repoId) return;
      await git.actions.push({ repo_id: repoId });
      setPushSuccess(true);
      setTimeout(() => setPushSuccess(false), 2000);
    } finally {
      setPushing(false);
    }
  };

  const performMerge = async () => {
    try {
      setMerging(true);
      const repoId = getSelectedRepoId();
      if (!repoId) return;
      await git.actions.merge({
        repoId,
      });
      setMergeSuccess(true);
      setTimeout(() => setMergeSuccess(false), 2000);
    } finally {
      setMerging(false);
    }
  };

  const handleRebaseWithNewBranchAndUpstream = async (
    newBaseBranch: string,
    selectedUpstream: string
  ) => {
    setRebasing(true);
    try {
      const repoId = getSelectedRepoId();
      if (!repoId) return;
      await git.actions.rebase({
        repoId,
        newBaseBranch: newBaseBranch,
        oldBaseBranch: selectedUpstream,
      });
    } finally {
      setRebasing(false);
    }
  };

  const handleRebaseDialogOpen = async () => {
    try {
      const defaultTargetBranch = getSelectedRepoStatus()?.target_branch_name;
      const result = await RebaseDialog.show({
        branches,
        isRebasing: rebasing,
        initialTargetBranch: defaultTargetBranch,
        initialUpstreamBranch: defaultTargetBranch,
      });
      if (
        result.action === 'confirmed' &&
        result.branchName &&
        result.upstreamBranch
      ) {
        await handleRebaseWithNewBranchAndUpstream(
          result.branchName,
          result.upstreamBranch
        );
      }
    } catch (error) {
      // User cancelled - do nothing
    }
  };

  // Opening the request itself is left to the host: what it is called and how it is opened
  // differ between them — a pull request on GitHub, a merge request on GitLab — and this pushes
  // the branch so that whichever one it is can be opened where it belongs.

  /**
   * Why each action is unavailable, or null when it is available.
   *
   * The same string both disables the button and explains it: a control that is greyed out with
   * no reason given is a question the person has to bring to someone else, and these have six
   * different causes that are not interchangeable.
   */
  const mergeDisabledReason: string | null = mergeInfo.hasMergedPR
    ? t('git.why.alreadyMerged', 'Already merged')
    : mergeInfo.hasOpenPR
      ? t(
          'git.why.prOpen',
          'A pull request is open for this branch — merge it there'
        )
      : merging
        ? t('git.why.merging', 'Merging…')
        : hasConflictsCalculated
          ? t('git.why.conflicts', 'Resolve the conflicts first')
          : isAttemptRunning
            ? t('git.why.running', 'Wait for the agent to finish')
            : selectedRepoStatus?.is_target_remote
              ? t(
                  'git.why.targetRemote',
                  'The target branch is on a remote — push and open the request there'
                )
              : commitsAhead === 0 && !recentlyActed
                ? t(
                    'git.why.nothingToMerge',
                    'Nothing to merge — this task has made no commits'
                  )
                : null;

  const pullDisabledReason: string | null = pulling
    ? t('git.states.pulling', 'Pulling…')
    : isAttemptRunning
      ? t('git.why.running', 'Wait for the agent to finish')
      : selectedRepoStatus?.is_rebase_in_progress
        ? t('git.why.rebaseInProgress', 'Finish the rebase first')
        : hasConflictsCalculated
          ? t('git.why.conflicts', 'Resolve the conflicts first')
          : null;

  const pushDisabledReason: string | null = pushing
    ? t('git.why.pushing', 'Pushing…')
    : isAttemptRunning
      ? t('git.why.running', 'Wait for the agent to finish')
      : hasConflictsCalculated
        ? t('git.why.conflicts', 'Resolve the conflicts first')
        : commitsAhead === 0 && remoteAhead === 0 && !recentlyActed
          ? t(
              'git.why.nothingToPush',
              'Nothing to push — this task has made no commits'
            )
          : null;

  const rebaseDisabledReason: string | null = rebasing
    ? t('git.why.rebasing', 'Rebasing…')
    : isAttemptRunning
      ? t('git.why.running', 'Wait for the agent to finish')
      : hasConflictsCalculated
        ? t('git.why.conflicts', 'Resolve the conflicts first')
        : null;

  const isVertical = layout === 'vertical';

  const containerClasses = isVertical
    ? 'grid grid-cols-1 items-start gap-3 overflow-hidden'
    : 'flex items-center gap-2 overflow-hidden';

  const settingsBtnClasses = isVertical
    ? 'inline-flex h-5 w-5 p-0 hover:bg-muted'
    : 'hidden md:inline-flex h-5 w-5 p-0 hover:bg-muted';

  const actionsClasses = isVertical
    ? 'flex flex-wrap items-center gap-2'
    : 'shrink-0 flex flex-wrap items-center gap-2 overflow-y-hidden overflow-x-visible max-h-8';

  const statusChips = <BranchStatusChips status={selectedRepoStatus} />;

  const branchChips = (
    <>
      {/* Task branch chip */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="hidden sm:inline-flex items-center gap-1.5 max-w-[280px] px-2 py-0.5 rounded-full bg-muted text-xs font-medium min-w-0">
              <GitBranchIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{selectedAttempt.branch}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t('git.labels.taskBranch')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <ArrowRight className="hidden sm:inline h-4 w-4 text-muted-foreground" />

      {/* Target branch chip + change button */}
      <div className="flex items-center gap-1 min-w-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1.5 max-w-[280px] px-2 py-0.5 rounded-full bg-muted text-xs font-medium min-w-0">
                <GitBranchIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">
                  {getSelectedRepoStatus()?.target_branch_name ||
                    selectedBranch ||
                    t('git.branch.current')}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t('rebase.dialog.targetLabel')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleChangeTargetBranchDialogOpen}
                disabled={isAttemptRunning || hasConflictsCalculated}
                className={settingsBtnClasses}
                aria-label={t('branches.changeTarget.dialog.title')}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t('branches.changeTarget.dialog.title')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </>
  );

  return (
    <div className="w-full border-b py-2">
      <div className={containerClasses}>
        {isVertical ? (
          <>
            {repos.length > 1 && (
              <RepoSelector
                repos={repos}
                selectedRepoId={getSelectedRepoId() ?? null}
                onRepoSelect={setSelectedRepoId}
                disabled={isAttemptRunning}
                placeholder={t('repos.selector.placeholder', 'Select repo')}
              />
            )}
          </>
        ) : (
          <>
            {repos.length > 0 && (
              <RepoSelector
                repos={repos}
                selectedRepoId={getSelectedRepoId() ?? null}
                onRepoSelect={setSelectedRepoId}
                disabled={isAttemptRunning}
                placeholder={t('repos.selector.placeholder', 'Select repo')}
                className="w-auto max-w-[200px] rounded-full bg-muted border-0 h-6 px-2 py-0.5 text-xs font-medium"
              />
            )}
            <div className="flex flex-1 items-center justify-center gap-2 min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                {branchChips}
              </div>
              {statusChips}
            </div>
          </>
        )}

        {/* Right: Actions */}
        {branchStatusError && !selectedRepoStatus ? (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{t('git.errors.branchStatusUnavailable')}</span>
          </div>
        ) : selectedRepoStatus ? (
          <div className={actionsClasses}>
            <ActionTooltip reason={mergeDisabledReason}>
              <Button
                onClick={handleMergeClick}
                disabled={mergeDisabledReason !== null}
                variant="outline"
                size="xs"
                className="h-6 gap-1 px-2 text-xs font-normal shrink-0"
                aria-label={mergeButtonLabel}
              >
                <GitBranchIcon className="h-3.5 w-3.5" />
                <span className="truncate max-w-[10ch]">
                  {mergeButtonLabel}
                </span>
              </Button>
            </ActionTooltip>

            <ActionTooltip reason={pushDisabledReason}>
              <Button
                onClick={handlePushClick}
                disabled={pushDisabledReason !== null}
                variant="outline"
                size="xs"
                className="h-6 gap-1 px-2 text-xs font-normal shrink-0"
                aria-label={pushButtonLabel}
              >
                <ArrowUpFromLine className="h-3.5 w-3.5" />
                <span className="truncate max-w-[10ch]">{pushButtonLabel}</span>
              </Button>
            </ActionTooltip>

            {remoteBehind > 0 && (
              <ActionTooltip reason={pullDisabledReason}>
                <Button
                  onClick={handlePullClick}
                  disabled={pullDisabledReason !== null}
                  variant="outline"
                  size="xs"
                  className="h-6 gap-1 px-2 text-xs font-normal shrink-0"
                  aria-label={pullButtonLabel}
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  <span className="truncate max-w-[12ch]">
                    {pullButtonLabel}
                  </span>
                </Button>
              </ActionTooltip>
            )}

            <ActionTooltip reason={rebaseDisabledReason}>
              <Button
                onClick={handleRebaseDialogOpen}
                disabled={rebaseDisabledReason !== null}
                variant="outline"
                size="xs"
                className="h-6 gap-1 px-2 text-xs font-normal shrink-0"
                aria-label={rebaseButtonLabel}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${rebasing ? 'animate-spin' : ''}`}
                />
                <span className="truncate max-w-[10ch]">
                  {rebaseButtonLabel}
                </span>
              </Button>
            </ActionTooltip>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default GitOperations;
