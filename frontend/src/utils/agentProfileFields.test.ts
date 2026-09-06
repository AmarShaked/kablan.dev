import { describe, expect, it } from 'vitest';
import { BaseCodingAgent } from 'shared/types';
import {
  agentBlurb,
  profileFieldCopy,
  profileFieldGroup,
} from './agentProfileFields';

describe('profileFieldGroup', () => {
  it('puts model with how it behaves', () => {
    expect(profileFieldGroup('model')).toBe('behavior');
    expect(profileFieldGroup('plan')).toBe('behavior');
  });

  it('puts append_prompt under instructions', () => {
    expect(profileFieldGroup('append_prompt')).toBe('instructions');
  });

  it('hides launch overrides under advanced', () => {
    expect(profileFieldGroup('base_command_override')).toBe('advanced');
    expect(profileFieldGroup('additional_params')).toBe('advanced');
    expect(profileFieldGroup('env')).toBe('advanced');
  });
});

describe('profileFieldCopy', () => {
  it('uses a Cursor-specific model hint', () => {
    expect(profileFieldCopy('model', BaseCodingAgent.CURSOR_AGENT).hint).toMatch(
      /composer-1/
    );
  });
});

describe('agentBlurb', () => {
  it('names Amp as Sourcegraph Amp', () => {
    expect(agentBlurb(BaseCodingAgent.AMP)).toBe('Sourcegraph Amp');
  });
});
