import { describe, expect, it } from 'vitest';
import { BaseCodingAgent, type ExecutorConfigs } from 'shared/types';
import {
  createProfile,
  deleteProfile,
  nextUntitledName,
  profileFormData,
  profileNames,
  renameProfile,
  setProfileFormData,
  validateProfileName,
} from './agentProfiles';

function sample(): ExecutorConfigs {
  return {
    executors: {
      [BaseCodingAgent.CLAUDE_CODE]: {
        DEFAULT: {
          CLAUDE_CODE: { dangerously_skip_permissions: true },
        },
        PLAN: {
          CLAUDE_CODE: { plan: true },
        },
      },
    },
  } as unknown as ExecutorConfigs;
}

describe('profileNames', () => {
  it('lists variant keys for one executor', () => {
    expect(profileNames(sample(), BaseCodingAgent.CLAUDE_CODE)).toEqual([
      'DEFAULT',
      'PLAN',
    ]);
  });
});

describe('setProfileFormData', () => {
  it('writes fields under the nested executor key', () => {
    const next = setProfileFormData(
      sample(),
      BaseCodingAgent.CLAUDE_CODE,
      'PLAN',
      { plan: true, model: 'opus' }
    );
    expect(
      profileFormData(next, BaseCodingAgent.CLAUDE_CODE, 'PLAN')
    ).toEqual({ plan: true, model: 'opus' });
  });
});

describe('createProfile', () => {
  it('clones the named source', () => {
    const next = createProfile(
      sample(),
      BaseCodingAgent.CLAUDE_CODE,
      'Untitled',
      'PLAN'
    );
    expect(
      profileFormData(next, BaseCodingAgent.CLAUDE_CODE, 'Untitled')
    ).toEqual({ plan: true });
  });
});

describe('renameProfile', () => {
  it('moves the nested config to the new key', () => {
    const next = renameProfile(
      sample(),
      BaseCodingAgent.CLAUDE_CODE,
      'PLAN',
      'THINK'
    );
    expect(profileNames(next, BaseCodingAgent.CLAUDE_CODE)).toEqual([
      'DEFAULT',
      'THINK',
    ]);
    expect(
      profileFormData(next, BaseCodingAgent.CLAUDE_CODE, 'THINK')
    ).toEqual({ plan: true });
  });

  it('does not overwrite an existing name', () => {
    const start = sample();
    expect(
      renameProfile(start, BaseCodingAgent.CLAUDE_CODE, 'PLAN', 'DEFAULT')
    ).toBe(start);
  });
});

describe('deleteProfile', () => {
  it('keeps the last profile', () => {
    const one = {
      executors: {
        [BaseCodingAgent.CLAUDE_CODE]: {
          DEFAULT: { CLAUDE_CODE: {} },
        },
      },
    } as unknown as ExecutorConfigs;
    expect(deleteProfile(one, BaseCodingAgent.CLAUDE_CODE, 'DEFAULT')).toBe(
      one
    );
  });

  it('drops a spare profile', () => {
    const next = deleteProfile(
      sample(),
      BaseCodingAgent.CLAUDE_CODE,
      'PLAN'
    );
    expect(profileNames(next, BaseCodingAgent.CLAUDE_CODE)).toEqual([
      'DEFAULT',
    ]);
  });
});

describe('nextUntitledName', () => {
  it('uses Untitled, then Untitled_2', () => {
    expect(nextUntitledName([])).toBe('Untitled');
    expect(nextUntitledName(['Untitled'])).toBe('Untitled_2');
    expect(nextUntitledName(['Untitled', 'Untitled_2'])).toBe('Untitled_3');
  });
});

describe('validateProfileName', () => {
  it('allows the current name through', () => {
    expect(validateProfileName('PLAN', ['DEFAULT', 'PLAN'], 'PLAN')).toBeNull();
  });

  it('rejects empty, junk, and collisions', () => {
    expect(validateProfileName('  ', [])).toBeTruthy();
    expect(validateProfileName('my setup', [])).toBeTruthy();
    expect(validateProfileName('PLAN', ['PLAN'])).toBeTruthy();
  });
});
