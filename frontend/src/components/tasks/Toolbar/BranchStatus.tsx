import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  GitPullRequest,
  RefreshCw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx';
import type { Merge, RepoBranchStatus } from 'shared/types';
import { cn } from '@/lib/utils';

/**
 * Where the task branch stands against its base, as one chip.
 *
 * Everything here is derived from the repo's branch status, so the chip lives wherever the base
 * branch is shown rather than in the toolbar that happens to fetch it. The states are ordered by
 * what stops you: a conflict or a rebase in progress outranks a merged PR, which outranks the
 * commit counts, which give way to "up to date" when there is nothing to say.
 */
export function BranchStatusChips({
  status,
  className,
  compact = false,
}: {
  status: RepoBranchStatus | null | undefined;
  className?: string;
  /**
   * Counts only, as arrows. The details pane gives this chip about 150px to share with the branch
   * name it sits beside, and "28 commits behind" spelled out leaves the name nothing; the sentence
   * moves to the tooltip instead of pushing the name off the row.
   */
  compact?: boolean;
}) {
  const { t } = useTranslation('tasks');

  const mergeInfo = useMemo(() => {
    if (!status?.merges)
      return {
        hasOpenPR: false,
        openPR: null as Merge | null,
        hasMergedPR: false,
      };
    const openPR = status.merges.find(
      (m: Merge) => m.type === 'pr' && m.pr_info.status === 'open'
    );
    const mergedPR = status.merges.find(
      (m: Merge) => m.type === 'pr' && m.pr_info.status === 'merged'
    );
    return {
      hasOpenPR: !!openPR,
      openPR: openPR ?? null,
      hasMergedPR: !!mergedPR,
    };
  }, [status]);

  const hasConflicts = (status?.conflicted_files?.length ?? 0) > 0;
  const commitsAhead = status?.commits_ahead ?? 0;
  const commitsBehind = status?.commits_behind ?? 0;

  const body = (() => {
    if (hasConflicts) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/60 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          {t('git.status.conflicts')}
        </span>
      );
    }

    if (status?.is_rebase_in_progress) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/60 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          {t('git.states.rebasing')}
        </span>
      );
    }

    if (mergeInfo.hasMergedPR) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/70 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          <CheckCircle className="h-3.5 w-3.5" />
          {t('git.states.merged')}
        </span>
      );
    }

    if (mergeInfo.hasOpenPR && mergeInfo.openPR?.type === 'pr') {
      const prMerge = mergeInfo.openPR;
      return (
        <button
          onClick={() => window.open(prMerge.pr_info.url, '_blank')}
          className="inline-flex max-w-[180px] items-center gap-1 truncate rounded-full bg-sky-100/60 px-2 py-0.5 text-sky-700 hover:underline dark:bg-sky-900/30 dark:text-sky-300 sm:max-w-none"
          aria-label={t('git.pr.open', {
            number: Number(prMerge.pr_info.number),
          })}
        >
          <GitPullRequest className="h-3.5 w-3.5" />
          {t('git.pr.number', { number: Number(prMerge.pr_info.number) })}
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      );
    }

    const chips: React.ReactNode[] = [];
    if (compact) {
      if (commitsAhead === 0 && commitsBehind === 0) return null;
      const parts = [
        commitsAhead > 0 &&
          `${commitsAhead} ${t('git.status.commits', { count: commitsAhead })} ${t('git.status.ahead')}`,
        commitsBehind > 0 &&
          `${commitsBehind} ${t('git.status.commits', { count: commitsBehind })} ${t('git.status.behind')}`,
      ].filter(Boolean);
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-1.5 py-0.5 tabular-nums">
                {commitsBehind > 0 && (
                  <>
                    <span className="text-warning">↓</span>
                    {commitsBehind}
                  </>
                )}
                {commitsAhead > 0 && (
                  <>
                    <span className="text-success">↑</span>
                    {commitsAhead}
                  </>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{parts.join(' · ')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    if (commitsAhead > 0) {
      chips.push(
        <span
          key="ahead"
          className="hidden items-center gap-1 rounded-full bg-emerald-100/70 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 sm:inline-flex"
        >
          +{commitsAhead} {t('git.status.commits', { count: commitsAhead })}{' '}
          {t('git.status.ahead')}
        </span>
      );
    }
    if (commitsBehind > 0) {
      chips.push(
        <span
          key="behind"
          className="inline-flex items-center gap-1 rounded-full bg-amber-100/60 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        >
          {commitsBehind} {t('git.status.commits', { count: commitsBehind })}{' '}
          {t('git.status.behind')}
        </span>
      );
    }
    if (chips.length > 0)
      return <div className="flex items-center gap-2">{chips}</div>;

    if (compact) return null;
    return (
      <span className="hidden text-muted-foreground sm:inline">
        {t('git.status.upToDate')}
      </span>
    );
  })();

  if (!body) return null;

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-xs',
        className
      )}
    >
      {body}
    </div>
  );
}
