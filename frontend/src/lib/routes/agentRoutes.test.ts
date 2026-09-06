import { describe, expect, it } from 'vitest';
import { BaseCodingAgent } from 'shared/types';
import {
  ADD_AGENT_PATH,
  SETTINGS_AGENTS_REDIRECT,
  SETTINGS_USAGE_REDIRECT,
  buildAgentPath,
  firstAgentPath,
  isAgentsPath,
  parseAgentParam,
} from './agentRoutes';

describe('buildAgentPath', () => {
  it('puts the executor enum in the URL', () => {
    expect(buildAgentPath(BaseCodingAgent.CLAUDE_CODE)).toBe(
      '/agents/CLAUDE_CODE'
    );
  });
});

describe('parseAgentParam', () => {
  it('reads a known executor', () => {
    expect(parseAgentParam('GEMINI')).toBe(BaseCodingAgent.GEMINI);
  });

  it('rejects junk and the add-agent segment', () => {
    expect(parseAgentParam('new')).toBeNull();
    expect(parseAgentParam('not-an-agent')).toBeNull();
    expect(parseAgentParam(undefined)).toBeNull();
  });
});

describe('isAgentsPath', () => {
  it('matches the agents area and nothing else', () => {
    expect(isAgentsPath('/agents')).toBe(true);
    expect(isAgentsPath('/agents/new')).toBe(true);
    expect(isAgentsPath('/agents/CLAUDE_CODE')).toBe(true);
    expect(isAgentsPath('/settings/agents')).toBe(false);
    expect(isAgentsPath('/local-projects')).toBe(false);
  });
});

describe('ADD_AGENT_PATH', () => {
  it('is the picker, not an executor name', () => {
    expect(ADD_AGENT_PATH).toBe('/agents/new');
    expect(parseAgentParam('new')).toBeNull();
  });
});

describe('firstAgentPath', () => {
  it('opens the first configured agent', () => {
    expect(
      firstAgentPath([BaseCodingAgent.GEMINI, BaseCodingAgent.CLAUDE_CODE])
    ).toBe('/agents/GEMINI');
  });

  it('opens the picker when none are configured', () => {
    expect(firstAgentPath([])).toBe(ADD_AGENT_PATH);
  });
});

describe('settings redirects', () => {
  it('sends the old Agents tab to the agents area', () => {
    expect(SETTINGS_AGENTS_REDIRECT).toBe('/agents');
  });

  it('sends Usage onto Claude, where the bars now live', () => {
    expect(SETTINGS_USAGE_REDIRECT).toBe('/agents/CLAUDE_CODE');
  });
});
