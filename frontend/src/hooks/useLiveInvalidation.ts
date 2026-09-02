import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { Operation } from 'rfc6902';

import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import { invalidationsFor } from '@/lib/liveInvalidation';

/** How long to gather changes before refetching. An agent run produces bursts, not a trickle. */
const COALESCE_MS = 250;

/**
 * Makes every cached view live, from one socket.
 *
 * A project's board streams its own tasks and corrects itself as they change. Nothing else did:
 * the archived listing, the cross-project page, the sidebar's counts are React Query caches that
 * only learned about a change when the code that made it remembered to tell them — and each fix
 * for a forgotten one was a patch on one call site, with the next call site left to forget.
 *
 * This subscribes once, at the top of the app, to the server's stream of every change, and
 * invalidates the caches each one touches. Views need to know nothing about it: they hold the
 * key they always held, and it goes stale when the data does. The per-call-site invalidations
 * stay for the instant response; this is what makes the ones nobody wrote unnecessary.
 *
 * Bursty by nature — one agent turn writes a process, a turn and a task — so changes are
 * gathered for a moment and refetched together.
 */
export function useLiveInvalidation() {
  const queryClient = useQueryClient();
  const pending = useRef(new Map<string, QueryKey>());
  const timer = useRef<number | null>(null);

  const flush = useCallback(() => {
    timer.current = null;
    const keys = [...pending.current.values()];
    pending.current.clear();
    for (const queryKey of keys) {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient]);

  const onPatches = useCallback(
    (ops: Operation[]) => {
      for (const key of invalidationsFor(ops)) {
        pending.current.set(JSON.stringify(key), key);
      }
      if (timer.current === null) {
        timer.current = window.setTimeout(flush, COALESCE_MS);
      }
    },
    [flush]
  );

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  // The state this stream would build is never read; the hook is here for its socket, its
  // reconnect behaviour, and the operations it lets us see.
  const { isConnected } = useJsonPatchWsStream<Record<string, never>>(
    '/api/events/ws',
    true,
    () => ({}),
    { onPatches, deduplicatePatches: () => [] }
  );

  return { isConnected };
}
