import { describe, expect, it } from 'vitest';
import { BaseCodingAgent } from 'shared/types';
import {
  extractAgentMention,
  parseMentionSegments,
  stripMentionToken,
} from './chatMentions';

describe('chatMentions', () => {
  const agents = [BaseCodingAgent.CLAUDE_CODE, BaseCodingAgent.CURSOR_AGENT];

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
});
