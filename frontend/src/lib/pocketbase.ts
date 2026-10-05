import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase';

/** Empty when unset — Chats then asks you to configure PocketBase. */
export const POCKETBASE_URL =
  (import.meta.env.VITE_POCKETBASE_URL as string | undefined)?.replace(
    /\/$/,
    ''
  ) ?? '';

export const isPocketBaseConfigured = () => POCKETBASE_URL.length > 0;

let client: PocketBase | null = null;

export function getPocketBase(): PocketBase | null {
  if (!isPocketBaseConfigured()) return null;
  if (!client) {
    client = new PocketBase(POCKETBASE_URL);
    client.autoCancellation(false);
  }
  return client;
}

export type PbUser = {
  id: string;
  email: string;
  name?: string;
};

export type PbChatKind = 'self' | 'dm' | 'group';

export type PbChat = RecordModel & {
  title: string;
  kind: PbChatKind;
  created_by: string;
  dm_key?: string;
};

/** Chat row for the sidebar / page header, with the other person resolved for DMs. */
export type PbChatListItem = PbChat & {
  peer: PbUser | null;
  label: string;
};

export type PbChatMember = RecordModel & {
  chat: string;
  user: string;
  role: 'owner' | 'member';
  expand?: {
    user?: PbUser;
    chat?: PbChat;
  };
};

export type PbMessage = RecordModel & {
  chat: string;
  author_user: string;
  author_agent: string;
  body: string;
  mentions?: string[] | null;
  task_project_id?: string;
  task_id?: string;
  expand?: {
    author_user?: PbUser;
  };
};

export function displayNameFromUser(user: {
  name?: string | null;
  email?: string | null;
}): string {
  const name = user.name?.trim();
  if (name) return name;
  const email = user.email?.trim();
  if (email) return email.split('@')[0] || email;
  return 'Me';
}

export function firstNameFromUser(user: {
  name?: string | null;
  email?: string | null;
}): string {
  return displayNameFromUser(user).split(/\s+/)[0] || 'Me';
}

/** Stable pair key so A↔B always opens the same DM. Order is lexicographic by id. */
export function dmKeyFor(userA: string, userB: string): string {
  return [userA, userB].sort().join('_');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Look up a signed-up Chats user by email. Returns null when nobody matches. */
export async function findUserByEmail(
  pb: PocketBase,
  email: string
): Promise<PbUser | null> {
  // PocketBase strips other users' emails from the collection API, so a normal
  // filter always misses. The PB hook below can read emails server-side and
  // only for signed-in callers — no Kablan admin credentials required.
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  try {
    const user = await pb.send<PbUser>('/api/kablan/lookup-user', {
      method: 'POST',
      body: { email: normalized },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name || undefined,
    };
  } catch (err) {
    if (err instanceof ClientResponseError) {
      if (err.status === 404) return null;
      const message = String(err.response?.message ?? err.message ?? '');
      if (/create a Chats account/i.test(message)) return null;
    }
    throw err;
  }
}

export class ChatInviteError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'self' | 'unsigned'
  ) {
    super(message);
    this.name = 'ChatInviteError';
  }
}

/** One in-flight ensure at a time — concurrent login/refresh used to create duplicate self-chats. */
let ensureSelfChatInFlight: Promise<PbChat> | null = null;

/** Ensure the signed-in user has exactly one self-chat and is a member of it. */
export async function ensureSelfChat(pb: PocketBase): Promise<PbChat> {
  if (ensureSelfChatInFlight) return ensureSelfChatInFlight;

  ensureSelfChatInFlight = (async () => {
    const userId = pb.authStore.record?.id;
    if (!userId) throw new Error('Not signed in');

    const title = displayNameFromUser({
      name: pb.authStore.record?.name as string | undefined,
      email: pb.authStore.record?.email as string | undefined,
    });

    const existing = await pb.collection('chats').getFullList<PbChat>({
      filter: `kind = "self" && created_by = "${userId}"`,
      sort: 'created',
    });

    let chat = existing[0];
    // Concurrent creates left extras — keep the oldest, drop the rest.
    for (const dup of existing.slice(1)) {
      try {
        await pb.collection('chats').delete(dup.id);
      } catch (err) {
        console.warn('Failed to delete duplicate self-chat', dup.id, err);
      }
    }

    if (!chat) {
      chat = await pb.collection('chats').create<PbChat>({
        title,
        kind: 'self',
        created_by: userId,
      });
    } else if (chat.title !== title) {
      chat = await pb.collection('chats').update<PbChat>(chat.id, { title });
    }

    const memberships = await pb.collection('chat_members').getList(1, 1, {
      filter: `chat = "${chat.id}" && user = "${userId}"`,
    });
    if (!memberships.items[0]) {
      await pb.collection('chat_members').create({
        chat: chat.id,
        user: userId,
        role: 'owner',
      });
    }

    return chat;
  })();

  try {
    return await ensureSelfChatInFlight;
  } finally {
    ensureSelfChatInFlight = null;
  }
}

/**
 * Find or create a 1:1 DM with the user at `email`.
 * Does not send email invites — the peer must already have a Chats account.
 */
export async function findOrCreateDmByEmail(
  pb: PocketBase,
  email: string
): Promise<PbChatListItem> {
  const meId = pb.authStore.record?.id;
  const myEmail = normalizeEmail(String(pb.authStore.record?.email ?? ''));
  if (!meId) throw new ChatInviteError('Not signed in', 'unsigned');

  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new ChatInviteError('Enter an email address', 'not_found');
  }
  if (normalized === myEmail) {
    throw new ChatInviteError(
      'That’s your own account — use your self chat instead.',
      'self'
    );
  }

  const peer = await findUserByEmail(pb, normalized);
  if (!peer) {
    throw new ChatInviteError(
      'They need to create a Chats account first.',
      'not_found'
    );
  }

  return findOrCreateDmWithUser(pb, peer);
}

export async function findOrCreateDmWithUser(
  pb: PocketBase,
  peer: PbUser
): Promise<PbChatListItem> {
  const meId = pb.authStore.record?.id;
  if (!meId) throw new ChatInviteError('Not signed in', 'unsigned');
  if (peer.id === meId) {
    throw new ChatInviteError(
      'That’s your own account — use your self chat instead.',
      'self'
    );
  }

  const key = dmKeyFor(meId, peer.id);
  const peerTitle = displayNameFromUser(peer);

  try {
    const existing = await pb
      .collection('chats')
      .getFirstListItem<PbChat>(`dm_key = "${key}"`);
    return { ...existing, peer, label: peerTitle };
  } catch (err) {
    if (!(err instanceof ClientResponseError) || err.status !== 404) {
      throw err;
    }
  }

  const chat = await pb.collection('chats').create<PbChat>({
    title: peerTitle,
    kind: 'dm',
    created_by: meId,
    dm_key: key,
  });

  await pb.collection('chat_members').create({
    chat: chat.id,
    user: meId,
    role: 'owner',
  });
  await pb.collection('chat_members').create({
    chat: chat.id,
    user: peer.id,
    role: 'member',
  });

  return { ...chat, peer, label: peerTitle };
}

export async function listChatMembers(
  pb: PocketBase,
  chatId: string
): Promise<PbChatMember[]> {
  return pb.collection('chat_members').getFullList<PbChatMember>({
    filter: `chat = "${chatId}"`,
    expand: 'user',
  });
}

function peerFromMembers(
  members: PbChatMember[],
  myId: string
): PbUser | null {
  const other = members.find((m) => m.user !== myId);
  if (!other) return null;
  if (other.expand?.user) {
    const u = other.expand.user;
    return {
      id: u.id,
      email: String(u.email ?? ''),
      name: u.name || undefined,
    };
  }
  return null;
}

export async function listMyChats(pb: PocketBase): Promise<PbChatListItem[]> {
  const userId = pb.authStore.record?.id;
  if (!userId) return [];

  const memberships = await pb
    .collection('chat_members')
    .getFullList<PbChatMember>({
      filter: `user = "${userId}"`,
      expand: 'chat',
    });

  const chats = memberships
    .map((m) => m.expand?.chat as PbChat | undefined)
    .filter((c): c is PbChat => !!c);

  // At most one self-chat in the sidebar (extras should already be deleted).
  const seenSelf = new Set<string>();
  const unique = chats.filter((c) => {
    if (c.kind !== 'self') return true;
    if (seenSelf.has(c.created_by)) return false;
    seenSelf.add(c.created_by);
    return true;
  });

  const selfLabel = displayNameFromUser({
    name: pb.authStore.record?.name as string | undefined,
    email: pb.authStore.record?.email as string | undefined,
  });

  const items: PbChatListItem[] = [];
  for (const chat of unique) {
    if (chat.kind === 'self') {
      items.push({ ...chat, peer: null, label: selfLabel });
      continue;
    }
    if (chat.kind === 'dm') {
      const members = await listChatMembers(pb, chat.id);
      const peer = peerFromMembers(members, userId);
      items.push({
        ...chat,
        peer,
        label: peer ? displayNameFromUser(peer) : chat.title,
      });
      continue;
    }
    items.push({ ...chat, peer: null, label: chat.title });
  }

  // Self first, then DMs by title.
  items.sort((a, b) => {
    if (a.kind === 'self' && b.kind !== 'self') return -1;
    if (b.kind === 'self' && a.kind !== 'self') return 1;
    return a.label.localeCompare(b.label);
  });

  return items;
}
