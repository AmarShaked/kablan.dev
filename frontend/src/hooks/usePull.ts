import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { PullError, PushTaskAttemptRequest } from 'shared/types';

class PullErrorWithData extends Error {
  constructor(
    message: string,
    public errorData?: PullError
  ) {
    super(message);
    this.name = 'PullErrorWithData';
  }
}

/**
 * Bring the attempt's branch up to date with its remote.
 *
 * Resolves to how many commits arrived, so a caller can tell an empty pull from a real one; the
 * two ways it can refuse — diverged history, dirty worktree — come back as data rather than a
 * message, because each needs a different thing from the person.
 *
 * The diff and the branch status both move when commits land, so both are invalidated.
 */
export function usePull(
  attemptId?: string,
  onSuccess?: (commitsPulled: number) => void,
  onError?: (err: unknown, errorData?: PullError) => void
) {
  const queryClient = useQueryClient();

  return useMutation<number, unknown, PushTaskAttemptRequest>({
    mutationFn: async (params: PushTaskAttemptRequest) => {
      if (!attemptId) return 0;
      const result = await attemptsApi.pull(attemptId, params);
      if (!result.success) {
        throw new PullErrorWithData(
          result.message || 'Pull failed',
          result.error
        );
      }
      return result.data ?? 0;
    },
    onSuccess: (commitsPulled) => {
      queryClient.invalidateQueries({ queryKey: ['branchStatus', attemptId] });
      queryClient.invalidateQueries({ queryKey: ['diff', attemptId] });
      onSuccess?.(commitsPulled);
    },
    onError: (err) => {
      console.error('Failed to pull:', err);
      const errorData =
        err instanceof PullErrorWithData ? err.errorData : undefined;
      onError?.(err, errorData);
    },
  });
}
