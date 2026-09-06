import { describe, expect, it } from 'vitest';
import { BaseCodingAgent } from 'shared/types';
import { agentConnectSteps } from './agentConnectSteps';

describe('agentConnectSteps', () => {
  it('gives Claude a copyable install and login command', () => {
    const steps = agentConnectSteps(BaseCodingAgent.CLAUDE_CODE);
    expect(steps.map((s) => s.n)).toEqual(['1', '2', '3']);
    expect(steps[0].command).toBe('npm i -g @anthropic-ai/claude-code');
    expect(steps[1].command).toBe('claude');
  });

  it('tells Cursor to run cursor-agent login', () => {
    const steps = agentConnectSteps(BaseCodingAgent.CURSOR_AGENT);
    expect(steps[1].command).toBe('cursor-agent login');
  });

  it('covers every coding agent', () => {
    for (const agent of Object.values(BaseCodingAgent)) {
      expect(agentConnectSteps(agent).length).toBeGreaterThan(0);
    }
  });
});
