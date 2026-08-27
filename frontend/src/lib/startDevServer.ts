import { attemptsApi } from '@/lib/api';

/**
 * Start the dev server for an attempt, asking first if another task already holds the port.
 *
 * Only one dev server can run per project. The server refuses instead of silently killing the
 * other one, so every caller has to decide what to do — this keeps that decision identical
 * wherever a dev server is started, rather than each call site inventing its own behaviour.
 *
 * Returns false when the user declined to take the port over.
 */
export async function startDevServerWithReplacePrompt(
  attemptId: string
): Promise<boolean> {
  try {
    await attemptsApi.startDevServer(attemptId);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Anything other than the port conflict is a real failure and belongs to the caller.
    if (!/already running/i.test(message)) throw err;

    const confirmed = window.confirm(
      `${message}\n\nStop it and start the dev server for this task instead?`
    );
    if (!confirmed) return false;

    await attemptsApi.startDevServer(attemptId, true);
    return true;
  }
}
