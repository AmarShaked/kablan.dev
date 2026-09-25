import { afterEach, describe, expect, it } from 'vitest';
import {
  claimClaudeLoginDialog,
  claudeLoginProcessId,
  isClaudeLoginError,
  resetClaudeLoginDialogClaims,
} from './claudeLoginError';

describe('isClaudeLoginError', () => {
  it('matches the expired subscription session Claude prints', () => {
    expect(
      isClaudeLoginError(
        'Failed to authenticate: OAuth session expired and could not be refreshed'
      )
    ).toBe(true);
  });

  it('matches the CLI telling you to sign in again', () => {
    expect(
      isClaudeLoginError(
        'Not logged in. Run claude auth login to authenticate.'
      )
    ).toBe(true);
    expect(isClaudeLoginError('Please run /login')).toBe(true);
  });

  it('ignores an ordinary task failure', () => {
    expect(isClaudeLoginError('Command failed with exit code 1')).toBe(false);
  });
});

describe('claimClaudeLoginDialog', () => {
  afterEach(() => {
    sessionStorage.clear();
    resetClaudeLoginDialogClaims();
  });

  it('reads the process id stored on the summary entry', () => {
    expect(claudeLoginProcessId('claude_login:proc-1')).toBe('proc-1');
    expect(claudeLoginProcessId('')).toBe(null);
  });

  it('opens once per failed run', () => {
    expect(claimClaudeLoginDialog('proc-1')).toBe(true);
    expect(claimClaudeLoginDialog('proc-1')).toBe(false);
    expect(claimClaudeLoginDialog('proc-2')).toBe(true);
  });

  it('stays closed when this tab already showed the dialog for that run', () => {
    sessionStorage.setItem('kablan:claude-login-dialog:proc-3', '1');
    expect(claimClaudeLoginDialog('proc-3')).toBe(false);
  });
});
