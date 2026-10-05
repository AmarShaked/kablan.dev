import type { BaseCodingAgent } from 'shared/types';
import { agentLabel } from '@/utils/agentLabels';

/** Tokens users can type after `@` for a given agent. */
export function mentionAliases(agent: BaseCodingAgent): string[] {
  const label = agentLabel(agent);
  return [
    agent,
    label,
    label.replace(/\s+/g, ''),
    label.split(/\s+/)[0] ?? label,
  ].filter(Boolean);
}

type AliasMatch = { agent: BaseCodingAgent; alias: string };

function aliasesByLength(agents: BaseCodingAgent[]): AliasMatch[] {
  const matches: AliasMatch[] = [];
  for (const agent of agents) {
    for (const alias of mentionAliases(agent)) {
      matches.push({ agent, alias });
    }
  }
  // Prefer longer aliases so `@Claude Code` wins over `@Claude`.
  matches.sort((a, b) => b.alias.length - a.alias.length);
  return matches;
}

/** First @Agent mention in text that matches a configured agent. */
export function extractAgentMention(
  text: string,
  agents: BaseCodingAgent[]
): BaseCodingAgent | null {
  for (const { agent, alias } of aliasesByLength(agents)) {
    const re = new RegExp(
      `@${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$|[.,!?;:])`,
      'i'
    );
    if (re.test(text)) return agent;
  }
  return null;
}

export function stripMentionToken(text: string, agent: BaseCodingAgent): string {
  const aliases = mentionAliases(agent)
    .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return text
    .replace(new RegExp(`@(?:${aliases})(?=\\s|$|[.,!?;:])`, 'gi'), '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type MentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; agent?: BaseCodingAgent };

/**
 * Split message text into plain runs and @mentions (agents + optional extra names).
 * Mentions keep the leading `@` in `value` for display.
 */
export function parseMentionSegments(
  text: string,
  agents: BaseCodingAgent[],
  extraNames: string[] = []
): MentionSegment[] {
  const patterns = [
    ...aliasesByLength(agents).map(({ agent, alias }) => ({
      agent,
      alias,
    })),
    ...extraNames
      .map((n) => n.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map((alias) => ({ agent: undefined as BaseCodingAgent | undefined, alias })),
  ];

  if (patterns.length === 0) return [{ type: 'text', value: text }];

  const union = patterns
    .map(({ alias }) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const re = new RegExp(`@(${union})(?=\\s|$|[.,!?;:])`, 'gi');

  const segments: MentionSegment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: 'text', value: text.slice(last, match.index) });
    }
    const raw = match[0];
    const token = match[1];
    const agent = agents.find((a) =>
      mentionAliases(a).some((alias) => alias.toLowerCase() === token.toLowerCase())
    );
    segments.push({ type: 'mention', value: raw, agent });
    last = match.index + raw.length;
  }
  if (last < text.length) {
    segments.push({ type: 'text', value: text.slice(last) });
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}
