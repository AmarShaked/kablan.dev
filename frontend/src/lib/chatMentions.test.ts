import { describe, expect, it } from 'vitest';
import { BaseCodingAgent } from 'shared/types';
import {
  extractAgentMention,
  extractProjectMention,
  parseMentionSegments,
  stripMentionToken,
} from './chatMentions';

describe('chatMentions', () => {
  const agents = [BaseCodingAgent.CLAUDE_CODE, BaseCodingAgent.CURSOR_AGENT];
  const projects = [
    { id: 'p1', name: 'Sweet UI' },
    { id: 'p2', name: 'kablan-app' },
  ];

  it('extracts @Claude mention', () => {
    expect(extractAgentMention('@Claude fix the login bug', agents)).toBe(
      BaseCodingAgent.CLAUDE_CODE
    );
  });

  it('extracts multi-word @Claude Code', () => {
    expect(
      extractAgentMention('@Claude Code you are here?', agents)
    ).toBe(BaseCodingAgent.CLAUDE_CODE);
  });

  it('extracts enum-style mention', () => {
    expect(extractAgentMention('hey @CLAUDE_CODE please help', agents)).toBe(
      BaseCodingAgent.CLAUDE_CODE
    );
  });

  it('returns null without a known agent', () => {
    expect(extractAgentMention('hello world', agents)).toBeNull();
  });

  it('strips mention tokens', () => {
    expect(
      stripMentionToken(
        '@Claude Code please ship this',
        BaseCodingAgent.CLAUDE_CODE
      )
    ).toMatch(/please ship this/i);
  });

  it('parses mention segments for highlight', () => {
    const segs = parseMentionSegments('@Claude Code you are here?', agents);
    expect(segs).toEqual([
      {
        type: 'mention',
        value: '@Claude Code',
        agent: BaseCodingAgent.CLAUDE_CODE,
      },
      { type: 'text', value: ' you are here?' },
    ]);
  });

  it('extracts #project mention', () => {
    expect(extractProjectMention('look at #Sweet UI please', projects)).toEqual(
      projects[0]
    );
  });

  it('parses #project segments', () => {
    const segs = parseMentionSegments(
      '@Claude in #Sweet UI',
      agents,
      [],
      projects
    );
    expect(segs).toEqual([
      {
        type: 'mention',
        value: '@Claude',
        agent: BaseCodingAgent.CLAUDE_CODE,
      },
      { type: 'text', value: ' in ' },
      { type: 'project', value: '#Sweet UI', projectId: 'p1' },
    ]);
  });
});
