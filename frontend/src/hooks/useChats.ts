import { useCallback, useEffect, useRef, useState } from 'react';

import { usePocketBaseAuth } from '@/hooks/usePocketBaseAuth';
import {
  getUnreadChatIds,
  persistUnreadChatIds,
  setChatLastRead,
} from '@/lib/chatUnread';
import {
  ensureSelfChat,
  listMyChats,
  type PbChatListItem,
  type PbChatMember,
  type PbMessage,
} from '@/lib/pocketbase';

/**
 * Sidebar chat list + unread dots.
 *
 * Subscribes to memberships (new DMs appear without refresh) and messages
 * (unread when you're not looking at that thread).
 */
export function useChats(activeChatId?: string | null) {
  const { pb, isSignedIn, ready, user } = usePocketBaseAuth();
  const [chats, setChats] = useState<PbChatListItem[]>([]);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setUnreadIds(new Set());
      return;
    }
    setUnreadIds(getUnreadChatIds(userId));
  }, [userId]);

  const markChatRead = useCallback(
    (chatId: string) => {
      if (!userId || !chatId) return;
      setChatLastRead(userId, chatId);
      setUnreadIds((prev) => {
        if (!prev.has(chatId)) return prev;
        const next = new Set(prev);
        next.delete(chatId);
        persistUnreadChatIds(userId, next);
        return next;
      });
    },
    [userId]
  );

  const markChatUnread = useCallback(
    (chatId: string) => {
      if (!userId || !chatId) return;
      if (activeChatIdRef.current === chatId) {
        markChatRead(chatId);
        return;
      }
      setUnreadIds((prev) => {
        if (prev.has(chatId)) return prev;
        const next = new Set(prev);
        next.add(chatId);
        persistUnreadChatIds(userId, next);
        return next;
      });
    },
    [userId, markChatRead]
  );

  const refresh = useCallback(async () => {
    if (!pb || !isSignedIn) {
      setChats([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await ensureSelfChat(pb);
      setChats(await listMyChats(pb));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chats');
    } finally {
      setLoading(false);
    }
  }, [pb, isSignedIn]);

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, refresh]);

  // Opening a thread clears its unread state.
  useEffect(() => {
    if (activeChatId) markChatRead(activeChatId);
  }, [activeChatId, markChatRead]);

  // Live memberships → new DMs show up for the invitee without a manual refresh.
  useEffect(() => {
    if (!pb || !isSignedIn || !userId) return;
    let unsub: (() => Promise<void>) | undefined;
    let cancelled = false;

    void pb
      .collection('chat_members')
      .subscribe<PbChatMember>('*', (e) => {
        if (e.record.user !== userId) return;
        void refresh();
        if (e.action === 'create') {
          markChatUnread(e.record.chat);
        }
      })
      .then((fn) => {
        if (cancelled) void fn();
        else unsub = fn;
      })
      .catch((err) => {
        if (!cancelled) console.error('chat_members subscribe failed', err);
      });

    return () => {
      cancelled = true;
      void unsub?.();
    };
  }, [pb, isSignedIn, userId, refresh, markChatUnread]);

  // Live messages → unread on chats you are not viewing.
  useEffect(() => {
    if (!pb || !isSignedIn || !userId) return;
    let unsub: (() => Promise<void>) | undefined;
    let cancelled = false;

    void pb
      .collection('messages')
      .subscribe<PbMessage>('*', (e) => {
        if (e.action !== 'create') return;
        const chatId = e.record.chat;
        if (!chatId) return;
        if (activeChatIdRef.current === chatId) {
          markChatRead(chatId);
          return;
        }
        // Own user messages don't create unread for yourself.
        if (e.record.author_user && e.record.author_user === userId) return;
        markChatUnread(chatId);
      })
      .then((fn) => {
        if (cancelled) void fn();
        else unsub = fn;
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('messages subscribe (sidebar) failed', err);
        }
      });

    return () => {
      cancelled = true;
      void unsub?.();
    };
  }, [pb, isSignedIn, userId, markChatRead, markChatUnread]);

  return {
    chats,
    unreadIds,
    isUnread: (chatId: string) => unreadIds.has(chatId),
    markChatRead,
    loading,
    error,
    refresh,
  };
}
