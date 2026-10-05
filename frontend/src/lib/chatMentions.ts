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
  | { type: 'mention'; value: string; agent?: BaseCodingAgent }
  | { type: 'project'; value: string; projectId?: string };

export type NamedProject = { id: string; name: string };

/** Tokens users can type after `#` for a project (full name preferred). */
export function projectAliases(project: NamedProject): string[] {
  const name = project.name.trim();
  if (!name) return [];
  return [name, name.replace(/\s+/g, '')].filter(
    (v, i, arr) => arr.indexOf(v) === i
  );
}

/** First #Project mention that matches a known project (longest name wins). */
export function extractProjectMention(
  text: string,
  projects: NamedProject[]
): NamedProject | null {
  const ranked = [...projects]
    .flatMap((project) =>
      projectAliases(project).map((alias) => ({ project, alias }))
    )
    .sort((a, b) => b.alias.length - a.alias.length);
  for (const { project, alias } of ranked) {
    const re = new RegExp(
      `#${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$|[.,!?;:])`,
      'i'
    );
    if (re.test(text)) return project;
  }
  return null;
}

/**
 * Split message text into plain runs, @mentions, and #project tokens.
 */
export function parseMentionSegments(
  text: string,
  agents: BaseCodingAgent[],
  extraNames: string[] = [],
  projects: NamedProject[] = []
): MentionSegment[] {
  type Hit = {
    index: number;
    length: number;
    segment: MentionSegment;
  };

  const hits: Hit[] = [];

  for (const { agent, alias } of aliasesByLength(agents)) {
    const re = new RegExp(
      `@${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$|[.,!?;:])`,
      'gi'
    );
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      hits.push({
        index: match.index,
        length: match[0].length,
        segment: { type: 'mention', value: match[0], agent },
      });
    }
  }

  for (const alias of extraNames
    .map((n) => n.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    const re = new RegExp(
      `@${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$|[.,!?;:])`,
      'gi'
    );
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      hits.push({
        index: match.index,
        length: match[0].length,
        segment: { type: 'mention', value: match[0] },
      });
    }
  }

  const projectHits = [...projects]
    .flatMap((project) =>
      projectAliases(project).map((alias) => ({ project, alias }))
    )
    .sort((a, b) => b.alias.length - a.alias.length);
  for (const { project, alias } of projectHits) {
    const re = new RegExp(
      `#${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$|[.,!?;:])`,
      'gi'
    );
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      hits.push({
        index: match.index,
        length: match[0].length,
        segment: {
          type: 'project',
          value: match[0],
          projectId: project.id,
        },
      });
    }
  }

  // Prefer longer / earlier hits; skip overlaps.
  hits.sort((a, b) => a.index - b.index || b.length - a.length);
  const chosen: Hit[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.index < cursor) continue;
    chosen.push(hit);
    cursor = hit.index + hit.length;
  }

  if (chosen.length === 0) return [{ type: 'text', value: text }];

  const segments: MentionSegment[] = [];
  let last = 0;
  for (const hit of chosen) {
    if (hit.index > last) {
      segments.push({ type: 'text', value: text.slice(last, hit.index) });
    }
    segments.push(hit.segment);
    last = hit.index + hit.length;
  }
  if (last < text.length) {
    segments.push({ type: 'text', value: text.slice(last) });
  }
  return segments;
}
