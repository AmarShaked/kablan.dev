import { useCallback, useEffect, useState } from 'react';

import { usePocketBaseAuth } from '@/hooks/usePocketBaseAuth';
import type { PbMessage } from '@/lib/pocketbase';

export function useChatMessages(chatId: string | undefined) {
  const { pb, isSignedIn } = usePocketBaseAuth();
  const [messages, setMessages] = useState<PbMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!pb || !isSignedIn || !chatId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await pb.collection('messages').getFullList<PbMessage>({
        filter: `chat = "${chatId}"`,
        sort: 'created',
        expand: 'author_user',
      });
      setMessages(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [pb, isSignedIn, chatId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pb || !isSignedIn || !chatId) return;

    let unsub: (() => Promise<void>) | undefined;
    let cancelled = false;

    void pb
      .collection('messages')
      .subscribe<PbMessage>('*', (e) => {
        if (e.record.chat !== chatId) return;
        setMessages((prev) => {
          if (e.action === 'delete') {
            return prev.filter((m) => m.id !== e.record.id);
          }
          // Realtime payloads often omit expand — keep any expand we already had.
          const withExpand = {
            ...e.record,
            expand:
              e.record.expand ??
              prev.find((m) => m.id === e.record.id)?.expand,
          };
          const idx = prev.findIndex((m) => m.id === e.record.id);
          if (idx === -1) return [...prev, withExpand];
          const next = [...prev];
          next[idx] = withExpand;
          return next;
        });
      })
      .then((fn) => {
        if (cancelled) void fn();
        else unsub = fn;
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Chat realtime subscribe failed', err);
        }
      });

    return () => {
      cancelled = true;
      void unsub?.();
    };
  }, [pb, isSignedIn, chatId]);

  return { messages, loading, error, refresh };
}
