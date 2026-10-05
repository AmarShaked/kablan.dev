import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Loader2, Send } from 'lucide-react';

import { ChatUserAvatar } from '@/components/chats/ChatUserAvatar';
import { MentionHighlight } from '@/components/chats/MentionHighlight';
import { AgentIcon } from '@/components/agents/AgentIcon';
import { PocketBaseAuthDialog } from '@/components/dialogs/auth/PocketBaseAuthDialog';
import { Button } from '@/components/ui/button';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useChats } from '@/hooks/useChats';
import { useConfiguredAgents } from '@/hooks/useConfiguredAgents';
import { usePocketBaseAuth } from '@/hooks/usePocketBaseAuth';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { chatsApi } from '@/lib/api';
import {
  extractAgentMention,
  mentionAliases,
} from '@/lib/chatMentions';
import { agentChatTone } from '@/lib/agentChatColors';
import {
  displayNameFromUser,
  ensureSelfChat,
  isPocketBaseConfigured,
  type PbMessage,
  type PbUser,
} from '@/lib/pocketbase';
import { paths } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { agentLabel } from '@/utils/agentLabels';
import { relativeDay, usesHour12 } from '@/utils/relativeDay';
import type { BaseCodingAgent } from 'shared/types';

export function ChatPage() {
  const { chatId } = useParams<{ chatId?: string }>();
  const navigate = useNavigate();
  const { config } = useUserSystem();
  const hour12 = usesHour12(config?.time_format);
  const { configured, isSignedIn, pb, user } = usePocketBaseAuth();
  const { chats, refresh: refreshChats } = useChats(chatId);
  const { messages, loading, error } = useChatMessages(chatId);
  const { configuredAgents } = useConfiguredAgents();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const draftExtraNames = useMemo(
    () => (user ? [displayNameFromUser(user), firstName(user)] : []),
    [user]
  );

  const chat = useMemo(
    () => chats.find((c) => c.id === chatId),
    [chats, chatId]
  );

  const chatTitle = chat?.label ?? 'Chat';
  const isDm = chat?.kind === 'dm';
  const peer = chat?.peer ?? null;

  const authorById = useMemo(() => {
    const map = new Map<string, PbUser>();
    if (user) map.set(user.id, user);
    if (peer) map.set(peer.id, peer);
    return map;
  }, [user, peer]);

  const mentionQuery = useMemo(() => {
    if (!mentionOpen) return '';
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor);
    const at = before.lastIndexOf('@');
    if (at < 0) return '';
    return before.slice(at + 1);
  }, [mentionOpen, draft]);

  const mentionOptions = useMemo(() => {
    const q = mentionQuery.toLowerCase();
    if (!q) return configuredAgents;
    return configuredAgents.filter((agent) =>
      mentionAliases(agent).some((alias) =>
        alias.toLowerCase().startsWith(q)
      )
    );
  }, [configuredAgents, mentionQuery]);

  useEffect(() => {
    if (mentionOpen) setMentionIndex(0);
  }, [mentionOpen, mentionOptions.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!isSignedIn || chatId || !pb) return;
    void (async () => {
      const self = await ensureSelfChat(pb);
      await refreshChats();
      navigate(paths.chat(self.id), { replace: true });
    })();
  }, [isSignedIn, chatId, pb, navigate, refreshChats]);

  const promptSignIn = async () => {
    const ok = await PocketBaseAuthDialog.show().catch(() => false);
    if (ok) await refreshChats();
  };

  const insertMention = (agent: BaseCodingAgent) => {
    const alias = mentionAliases(agent)[1] ?? agent;
    const el = textareaRef.current;
    const value = draft;
    const cursor = el?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const at = before.lastIndexOf('@');
    const next =
      at >= 0
        ? `${before.slice(0, at)}@${alias} ${after}`
        : `${before}@${alias} ${after}`;
    setDraft(next);
    setMentionOpen(false);
    setMentionIndex(0);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = at >= 0 ? at + alias.length + 2 : next.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const at = before.lastIndexOf('@');
    if (at >= 0 && !/\s/.test(before.slice(at + 1))) {
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && mentionOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionOptions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(
          (i) => (i - 1 + mentionOptions.length) % mentionOptions.length
        );
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        insertMention(mentionOptions[mentionIndex] ?? mentionOptions[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionOptions[mentionIndex] ?? mentionOptions[0]);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !pb || !user || !chatId) return;
    setSending(true);
    setSendError(null);
    try {
      const agent = extractAgentMention(body, configuredAgents);
      const mentions = agent ? [agent] : [];
      const created = await pb.collection('messages').create<PbMessage>({
        chat: chatId,
        author_user: user.id,
        author_agent: '',
        body,
        mentions,
      });
      setDraft('');
      setMentionOpen(false);
      if (agent) {
        await chatsApi.agentTurn(chatId, {
          message_id: created.id,
          agent,
        });
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (!configured || !isPocketBaseConfigured()) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-3 p-8">
        <h1 className="text-xl font-semibold">Chats</h1>
        <p className="text-sm text-muted-foreground">
          Set <code>VITE_POCKETBASE_URL</code> to enable optional chat accounts
          (see <code>deploy/pocketbase/README.md</code>). Projects and tasks
          keep working without it.
        </p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-3 p-8">
        <h1 className="text-xl font-semibold">Chats</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with PocketBase to message yourself and tag agents.
        </p>
        <Button onClick={() => void promptSignIn()}>Sign in</Button>
      </div>
    );
  }

  if (!chatId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Opening self chat…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-3">
        <h1 className="text-base font-semibold">{chatTitle}</h1>
        <p className="text-xs text-muted-foreground">
          {isDm
            ? `Direct message with ${chatTitle}. Tag an agent with @ to run a turn that can create and start tasks.`
            : 'Message yourself. Tag an agent with @ to run a turn that can create and start tasks.'}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading && messages.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-4">
          {filterVisibleMessages(messages).map((m) => (
            <MessageRow
              key={m.id}
              message={m}
              selfUser={user}
              authorById={authorById}
              hour12={hour12}
              agents={configuredAgents}
            />
          ))}
        </div>
        <div ref={bottomRef} />
      </div>

      <div className="relative border-t p-3">
        {mentionOpen && mentionOptions.length > 0 && (
          <div
            className="absolute bottom-full left-3 mb-1 w-56 overflow-hidden rounded-md border bg-popover shadow-md"
            role="listbox"
            aria-label="Mention agent"
          >
            {mentionOptions.map((agent, index) => (
              <button
                key={agent}
                type="button"
                role="option"
                aria-selected={index === mentionIndex}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                  index === mentionIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/60'
                )}
                onMouseEnter={() => setMentionIndex(index)}
                onClick={() => insertMention(agent)}
              >
                <AgentIcon agent={agent} className="size-4 shrink-0" />
                <span>{mentionAliases(agent)[1] ?? agent}</span>
              </button>
            ))}
          </div>
        )}
        {sendError && (
          <p className="mb-2 text-xs text-destructive">{sendError}</p>
        )}
        <div className="flex items-center gap-2">
          <div className="relative min-h-[2.5rem] flex-1">
            <div
              ref={highlightRef}
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent bg-background px-3 py-2 text-sm text-foreground',
                !draft && 'opacity-0'
              )}
            >
              <MentionHighlight
                text={draft.endsWith('\n') ? `${draft}\u00a0` : draft || ' '}
                agents={configuredAgents}
                extraNames={draftExtraNames}
                variant="composer"
              />
            </div>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={onComposerKeyDown}
              onScroll={(e) => {
                if (highlightRef.current) {
                  highlightRef.current.scrollTop = e.currentTarget.scrollTop;
                  highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
              rows={2}
              placeholder={`Message ${chatTitle}…`}
              className={cn(
                'relative min-h-[2.5rem] w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none',
                'caret-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring',
                draft ? 'text-transparent' : 'text-foreground'
              )}
            />
          </div>
          <Button
            size="icon"
            className="shrink-0"
            disabled={sending || !draft.trim()}
            onClick={() => void send()}
            title="Send"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageRow({
  message,
  selfUser,
  authorById,
  hour12,
  agents,
}: {
  message: PbMessage;
  selfUser: PbUser | null;
  authorById: Map<string, PbUser>;
  hour12: boolean;
  agents: BaseCodingAgent[];
}) {
  const isAgent = !!message.author_agent;
  const authorUser =
    message.expand?.author_user ??
    (message.author_user ? authorById.get(message.author_user) : undefined) ??
    (message.author_user === selfUser?.id ? selfUser : null);
  const authorName = isAgent
    ? agentLabel(message.author_agent)
    : displayNameFromUser(authorUser ?? {});
  const extraNames = [
    ...[...authorById.values()].flatMap((u) => [
      displayNameFromUser(u),
      firstName(u),
    ]),
  ];
  const created =
    typeof message.created === 'string' ? message.created : undefined;
  const timeLabel = created ? relativeDay(created, hour12) : '';
  const taskHref =
    message.task_project_id && message.task_id
      ? paths.task(message.task_project_id, message.task_id)
      : null;

  const isWaiting =
    isAgent && /^Working on it/i.test(message.body.trim());
  const tone = isAgent ? agentChatTone(message.author_agent) : null;

  return (
    <div className="flex gap-3">
      {isAgent ? (
        <span
          aria-hidden
          className={cn(
            'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md',
            tone?.avatar ?? 'bg-muted',
            isWaiting && 'animate-pulse'
          )}
        >
          <AgentIcon
            agent={message.author_agent as BaseCodingAgent}
            className="size-5"
          />
        </span>
      ) : (
        <ChatUserAvatar name={authorName} size="md" className="mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-foreground">
            {authorName}
          </span>
          {timeLabel && (
            <span className="text-xs text-muted-foreground">{timeLabel}</span>
          )}
        </div>
        {isWaiting ? (
          <div className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <span>Working on it</span>
            <span className="inline-flex gap-0.5" aria-hidden>
              <span className="animate-bounce [animation-delay:0ms]">.</span>
              <span className="animate-bounce [animation-delay:150ms]">.</span>
              <span className="animate-bounce [animation-delay:300ms]">.</span>
            </span>
          </div>
        ) : taskHref ? (
          <TaskCreatedCard
            href={taskHref}
            body={message.body}
            agents={agents}
            extraNames={extraNames}
          />
        ) : (
          <div className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
            <MentionHighlight
              text={message.body}
              agents={agents}
              extraNames={extraNames}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Rich card for agent replies that created a Kablan task (task_id on the message). */
function TaskCreatedCard({
  href,
  body,
  agents,
  extraNames,
}: {
  href: string;
  body: string;
  agents: BaseCodingAgent[];
  extraNames: string[];
}) {
  // Strip legacy "Open: /local-projects/..." lines from older messages.
  const displayBody = body
    .split('\n')
    .filter((line) => !/^Open:\s*\/local-projects\//i.test(line.trim()))
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .trim();

  return (
    <div className="mt-1.5 max-w-md overflow-hidden rounded-md border bg-muted/40">
      <div className="border-b px-3 py-2 text-sm text-foreground">
        <MentionHighlight
          text={displayBody || 'Created and started a task.'}
          agents={agents}
          extraNames={extraNames}
        />
      </div>
      <Link
        to={href}
        className="flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-info transition-colors hover:bg-muted/60"
      >
        <span>Open task</span>
        <ArrowRight className="size-4 shrink-0" />
      </Link>
    </div>
  );
}

function isWaitingMessage(message: PbMessage): boolean {
  return (
    !!message.author_agent &&
    /^Working on it/i.test((message.body || '').trim())
  );
}

/** Hide leftover waiting bubbles once a later reply from the same agent exists. */
function filterVisibleMessages(messages: PbMessage[]): PbMessage[] {
  return messages.filter((m, index) => {
    if (!isWaitingMessage(m)) return true;
    return !messages
      .slice(index + 1)
      .some(
        (later) =>
          later.author_agent === m.author_agent && !isWaitingMessage(later)
      );
  });
}

function firstName(user: PbUser): string {
  return displayNameFromUser(user).split(/\s+/)[0] ?? '';
}
