import { describe, expect, it } from 'vitest';
import { BaseCodingAgent } from 'shared/types';
import {
  defaultProfileDescription,
  deleteProfileMeta,
  parseProfileMeta,
  profileDescription,
  renameProfileMeta,
  setProfileDescription,
} from './agentProfileMeta';

describe('defaultProfileDescription', () => {
  it('names the built-in profiles in plain language', () => {
    expect(defaultProfileDescription('DEFAULT')).toBe('Everyday run');
    expect(defaultProfileDescription('PLAN')).toBe('Plan before editing');
    expect(defaultProfileDescription('MY_SETUP')).toBe('Custom setup');
  });
});

describe('profileDescription', () => {
  it('prefers a stored line over the built-in one', () => {
    const map = setProfileDescription(
      {},
      BaseCodingAgent.CLAUDE_CODE,
      'DEFAULT',
      'Ship work'
    );
    expect(
      profileDescription(map, BaseCodingAgent.CLAUDE_CODE, 'DEFAULT')
    ).toBe('Ship work');
  });
});

describe('renameProfileMeta', () => {
  it('moves the description to the new name', () => {
    const map = setProfileDescription(
      {},
      BaseCodingAgent.CLAUDE_CODE,
      'PLAN',
      'Think first'
    );
    const renamed = renameProfileMeta(
      map,
      BaseCodingAgent.CLAUDE_CODE,
      'PLAN',
      'THINK'
    );
    expect(
      profileDescription(renamed, BaseCodingAgent.CLAUDE_CODE, 'THINK')
    ).toBe('Think first');
    expect(
      renamed[BaseCodingAgent.CLAUDE_CODE]?.PLAN
    ).toBeUndefined();
  });
});

describe('deleteProfileMeta', () => {
  it('drops that profile only', () => {
    let map = setProfileDescription(
      {},
      BaseCodingAgent.CLAUDE_CODE,
      'PLAN',
      'Think first'
    );
    map = setProfileDescription(
      map,
      BaseCodingAgent.CLAUDE_CODE,
      'DEFAULT',
      'Everyday'
    );
    map = deleteProfileMeta(map, BaseCodingAgent.CLAUDE_CODE, 'PLAN');
    expect(map[BaseCodingAgent.CLAUDE_CODE]?.PLAN).toBeUndefined();
    expect(map[BaseCodingAgent.CLAUDE_CODE]?.DEFAULT?.description).toBe(
      'Everyday'
    );
  });
});

describe('parseProfileMeta', () => {
  it('returns empty on junk', () => {
    expect(parseProfileMeta(null)).toEqual({});
    expect(parseProfileMeta('nope')).toEqual({});
  });
});
