import { describe, expect, it } from 'vitest';
import { BaseCodingAgent } from 'shared/types';
import {
  parseStoredConfiguredAgents,
  resolveConfiguredAgents,
  seedConfiguredAgents,
} from './configuredAgents';

describe('seedConfiguredAgents', () => {
  it('starts from connected agents and always includes the default', () => {
    expect(
      seedConfiguredAgents(BaseCodingAgent.CURSOR_AGENT, [
        BaseCodingAgent.CLAUDE_CODE,
        BaseCodingAgent.GEMINI,
      ])
    ).toEqual([
      BaseCodingAgent.CLAUDE_CODE,
      BaseCodingAgent.CURSOR_AGENT,
      BaseCodingAgent.GEMINI,
    ]);
  });

  it('deduplicates the default when it is already connected', () => {
    expect(
      seedConfiguredAgents(BaseCodingAgent.CLAUDE_CODE, [
        BaseCodingAgent.CLAUDE_CODE,
      ])
    ).toEqual([BaseCodingAgent.CLAUDE_CODE]);
  });
});

describe('parseStoredConfiguredAgents', () => {
  it('reads the zustand session payload used by the mock', () => {
    expect(
      parseStoredConfiguredAgents(
        JSON.stringify({
          state: {
            configured: [BaseCodingAgent.CLAUDE_CODE, BaseCodingAgent.GEMINI],
          },
          version: 0,
        })
      )
    ).toEqual([BaseCodingAgent.CLAUDE_CODE, BaseCodingAgent.GEMINI]);
  });

  it('returns null when nothing was stored', () => {
    expect(parseStoredConfiguredAgents(null)).toBeNull();
    expect(parseStoredConfiguredAgents('not-json')).toBeNull();
    expect(
      parseStoredConfiguredAgents(JSON.stringify({ state: { configured: [] } }))
    ).toBeNull();
  });
});

describe('resolveConfiguredAgents', () => {
  it('keeps a persisted list and does not write again', () => {
    expect(
      resolveConfiguredAgents({
        persisted: [BaseCodingAgent.AMP],
        stored: [BaseCodingAgent.CLAUDE_CODE],
        defaultAgent: BaseCodingAgent.CLAUDE_CODE,
        connectedAgents: [BaseCodingAgent.GEMINI],
      })
    ).toEqual({
      agents: [BaseCodingAgent.AMP],
      shouldPersist: false,
    });
  });

  it('promotes the mock session list into config once', () => {
    expect(
      resolveConfiguredAgents({
        persisted: null,
        stored: [BaseCodingAgent.CURSOR_AGENT, BaseCodingAgent.CLAUDE_CODE],
        defaultAgent: BaseCodingAgent.GEMINI,
        connectedAgents: [BaseCodingAgent.GEMINI],
      })
    ).toEqual({
      agents: [BaseCodingAgent.CLAUDE_CODE, BaseCodingAgent.CURSOR_AGENT],
      shouldPersist: true,
    });
  });

  it('seeds from connected agents plus the default when nothing is stored', () => {
    expect(
      resolveConfiguredAgents({
        persisted: undefined,
        stored: null,
        defaultAgent: BaseCodingAgent.CLAUDE_CODE,
        connectedAgents: [BaseCodingAgent.GEMINI],
      })
    ).toEqual({
      agents: [BaseCodingAgent.CLAUDE_CODE, BaseCodingAgent.GEMINI],
      shouldPersist: true,
    });
  });
});
