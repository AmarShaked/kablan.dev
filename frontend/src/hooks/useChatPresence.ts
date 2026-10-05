import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';

import { usePocketBaseAuth } from '@/hooks/usePocketBaseAuth';

/** Consider online if last_seen within this window (covers ~2 missed heartbeats). */
export const PRESENCE_ONLINE_MS = 60_000;
const HEARTBEAT_MS = 25_000;
const EXPIRE_TICK_MS = 15_000;

function isFresh(lastSeen: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeen) return false;
  const t = Date.parse(lastSeen);
  if (Number.isNaN(t)) return false;
  return now - t < PRESENCE_ONLINE_MS;
}

/**
 * Keeps the signed-in user marked online and tracks peer last_seen for chat dots.
 */
export function useChatPresence(peerUserIds: string[]) {
  const { pb, isSignedIn, user } = usePocketBaseAuth();
  const [lastSeenByUser, setLastSeenByUser] = useState<Record<string, string>>(
    {}
  );
  const [now, setNow] = useState(() => Date.now());
  const peerKey = useMemo(
    () => [...new Set(peerUserIds.filter(Boolean))].sort().join(','),
    [peerUserIds]
  );
  const peers = useMemo(
    () => (peerKey ? peerKey.split(',') : []),
    [peerKey]
  );

  const bumpSelf = useCallback(async (client: PocketBase, userId: string) => {
    const iso = new Date().toISOString();
    try {
      await client.collection('users').update(userId, { last_seen: iso });
      setLastSeenByUser((prev) =>
        prev[userId] === iso ? prev : { ...prev, [userId]: iso }
      );
    } catch (err) {
      console.warn('presence heartbeat failed', err);
    }
  }, []);

  // Heartbeat while signed in (and on tab focus).
  useEffect(() => {
    if (!pb || !isSignedIn || !user?.id) return;
    const userId = user.id;

    void bumpSelf(pb, userId);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void bumpSelf(pb, userId);
    }, HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void bumpSelf(pb, userId);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pb, isSignedIn, user?.id, bumpSelf]);

  // Load + subscribe last_seen for self + peers.
  useEffect(() => {
    if (!pb || !isSignedIn || !user?.id) {
      setLastSeenByUser({});
      return;
    }

    const ids = [...new Set([user.id, ...peers])];
    let cancelled = false;
    let unsub: (() => Promise<void>) | undefined;

    const applyRecord = (record: RecordModel) => {
      const lastSeen = record.last_seen
        ? String(record.last_seen)
        : '';
      setLastSeenByUser((prev) => {
        if ((prev[record.id] ?? '') === lastSeen) return prev;
        return { ...prev, [record.id]: lastSeen };
      });
    };

    void (async () => {
      try {
        if (ids.length === 1) {
          const record = await pb.collection('users').getOne(ids[0]);
          if (!cancelled) applyRecord(record);
        } else {
          const filter = ids.map((id) => `id="${id}"`).join(' || ');
          const records = await pb.collection('users').getFullList({ filter });
          if (cancelled) return;
          for (const record of records) applyRecord(record);
        }
      } catch (err) {
        if (!cancelled) console.warn('presence fetch failed', err);
      }
    })();

    void pb
      .collection('users')
      .subscribe<RecordModel>('*', (e) => {
        if (!ids.includes(e.record.id)) return;
        applyRecord(e.record);
      })
      .then((fn) => {
        if (cancelled) void fn();
        else unsub = fn;
      })
      .catch((err) => {
        if (!cancelled) console.warn('presence subscribe failed', err);
      });

    return () => {
      cancelled = true;
      void unsub?.();
    };
  }, [pb, isSignedIn, user?.id, peerKey, peers]);

  // Locally expire greens without waiting for another subscribe event.
  useEffect(() => {
    if (!isSignedIn) return;
    const tick = window.setInterval(() => setNow(Date.now()), EXPIRE_TICK_MS);
    return () => window.clearInterval(tick);
  }, [isSignedIn]);

  const onlineIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, lastSeen] of Object.entries(lastSeenByUser)) {
      if (isFresh(lastSeen, now)) set.add(id);
    }
    return set;
  }, [lastSeenByUser, now]);

  const isOnline = useCallback(
    (userId: string | null | undefined) =>
      !!userId && onlineIds.has(userId),
    [onlineIds]
  );

  // Stable ref so callers can depend on isOnline without thrashing.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  return { isOnline, onlineIds };
}
