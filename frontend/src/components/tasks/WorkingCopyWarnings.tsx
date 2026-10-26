import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { useRepoWorkingCopy } from '@/hooks';
import { cn } from '@/lib/utils';

type Repo = {
  repoId: string;
  repoDisplayName: string;
};

type Props = {
  repos: Repo[];
  className?: string;
};

/**
 * What the repo's own checkout means for the task about to start.
 *
 * A task runs in a worktree branched from HEAD, which is correct git behaviour but silent:
 * half-finished work in the source repo is not in the tree the agent sees. And a repo with
 * no remote cannot produce a pull request — better said here than after the work is done.
 */
export function WorkingCopyWarnings({ repos, className }: Props) {
  const { t } = useTranslation('tasks');
  const repoIds = useMemo(() => repos.map((r) => r.repoId), [repos]);
  const workingCopies = useRepoWorkingCopy(repoIds);

  const warnings = useMemo(() => {
    const multiRepo = repos.length > 1;
    const lines: string[] = [];

    for (const repo of repos) {
      const state = workingCopies[repo.repoId];
      if (!state) continue;

      const changes = state.uncommitted_count + state.untracked_count;
      if (changes > 0) {
        lines.push(
          t(
            multiRepo
              ? 'workingCopyWarnings.uncommittedInRepo'
              : 'workingCopyWarnings.uncommitted',
            { count: changes, repo: repo.repoDisplayName }
          )
        );
      }
      if (!state.has_remote) {
        lines.push(
          t(
            multiRepo
              ? 'workingCopyWarnings.noRemoteInRepo'
              : 'workingCopyWarnings.noRemote',
            { repo: repo.repoDisplayName }
          )
        );
      }
    }

    return lines;
  }, [repos, workingCopies, t]);

  if (warnings.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {warnings.map((warning) => (
        <p
          key={warning}
          className="flex items-start gap-1.5 text-xs text-muted-foreground"
        >
          <AlertTriangle
            className="h-3.5 w-3.5 shrink-0 mt-px text-amber-500"
            aria-hidden="true"
          />
          <span>{warning}</span>
        </p>
      ))}
    </div>
  );
}

export default WorkingCopyWarnings;
