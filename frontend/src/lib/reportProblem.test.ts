import { describe, expect, it } from 'vitest';

import type { Environment } from 'shared/types';
import { buildReportProblemUrl, environmentReport } from './reportProblem';

const macos: Environment = {
  os_type: 'Mac OS',
  os_version: '26.0',
  os_architecture: 'arm64',
  bitness: '64-bit',
};

describe('environmentReport', () => {
  it('writes the version, the OS and the browser as lines a person could have typed', () => {
    const lines = environmentReport(macos).split('\n');

    expect(lines[0]).toMatch(/^Kablan: /);
    expect(lines[1]).toBe('OS: Mac OS 26.0 (arm64)');
    expect(lines[2]).toMatch(/^Browser: /);
  });

  it('leaves the OS line for the user to fill in when the server has not answered yet', () => {
    expect(environmentReport(null)).toContain('OS:');
  });

  it('does not write "Unknown" into the OS line', () => {
    const unknown: Environment = { ...macos, os_version: 'Unknown' };

    expect(environmentReport(unknown)).toContain('OS: Mac OS (arm64)');
  });
});

describe('buildReportProblemUrl', () => {
  it('points at the repository issue form, not a generic new issue', () => {
    const url = new URL(buildReportProblemUrl({ environment: macos }));

    expect(url.origin).toBe('https://github.com');
    expect(url.pathname).toBe('/AmarShaked/kablan.dev/issues/new');
    expect(url.searchParams.get('template')).toBe('didnt-work.yml');
  });

  it('pre-fills the fields the template asks for', () => {
    const url = new URL(
      buildReportProblemUrl({ environment: macos, executor: 'CLAUDE_CODE' })
    );

    expect(url.searchParams.get('environment')).toContain('Mac OS 26.0');
    expect(url.searchParams.get('agent')).toBe('Claude Code');
  });

  it('omits the agent rather than guessing when nothing has been picked', () => {
    const url = new URL(buildReportProblemUrl({ environment: macos }));

    expect(url.searchParams.has('agent')).toBe(false);
  });

  it('can target the ordinary bug form too', () => {
    const url = new URL(
      buildReportProblemUrl({ environment: macos }, 'bug-report.yml')
    );

    expect(url.searchParams.get('template')).toBe('bug-report.yml');
  });
});
