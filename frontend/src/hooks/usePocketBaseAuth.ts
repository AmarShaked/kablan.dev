import { useCallback, useEffect, useState } from 'react';
import type { RecordModel } from 'pocketbase';

import {
  ensureSelfChat,
  getPocketBase,
  isPocketBaseConfigured,
  type PbUser,
} from '@/lib/pocketbase';

function toUser(record: RecordModel | null | undefined): PbUser | null {
  if (!record) return null;
  return {
    id: record.id,
    email: String(record.email ?? ''),
    name: record.name ? String(record.name) : undefined,
  };
}

/**
 * Optional PocketBase session. The rest of Kablan does not depend on this;
 * Chats does.
 */
export function usePocketBaseAuth() {
  const configured = isPocketBaseConfigured();
  const pb = getPocketBase();
  const [user, setUser] = useState<PbUser | null>(() =>
    toUser(pb?.authStore.record)
  );
  const [ready, setReady] = useState(!configured);

  useEffect(() => {
    if (!pb) {
      setReady(true);
      return;
    }
    setUser(toUser(pb.authStore.record));
    setReady(true);
    return pb.authStore.onChange(() => {
      setUser(toUser(pb.authStore.record));
    });
  }, [pb]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!pb) throw new Error('PocketBase is not configured');
      await pb.collection('users').authWithPassword(email, password);
      await ensureSelfChat(pb);
      setUser(toUser(pb.authStore.record));
    },
    [pb]
  );

  const signUp = useCallback(
    async (email: string, password: string, name?: string) => {
      if (!pb) throw new Error('PocketBase is not configured');
      await pb.collection('users').create({
        email,
        password,
        passwordConfirm: password,
        name: name || email.split('@')[0],
      });
      await pb.collection('users').authWithPassword(email, password);
      await ensureSelfChat(pb);
      setUser(toUser(pb.authStore.record));
    },
    [pb]
  );

  const signOut = useCallback(() => {
    pb?.authStore.clear();
    setUser(null);
  }, [pb]);

  return {
    configured,
    ready,
    user,
    isSignedIn: !!user,
    signIn,
    signUp,
    signOut,
    pb,
  };
}
