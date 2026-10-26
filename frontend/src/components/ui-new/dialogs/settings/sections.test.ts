import { describe, it, expect } from 'vitest';

import { visibleSettingsSections, resolveInitialSection } from './sections';

describe('visibleSettingsSections', () => {
  it('hides organizations and remote projects when remote is not configured', () => {
    const sections = visibleSettingsSections(false);

    expect(sections).not.toContain('organizations');
    expect(sections).not.toContain('remote-projects');
    expect(sections).toEqual(['general', 'repos', 'agents', 'mcp']);
  });

  it('shows them when the shared API base is set', () => {
    const sections = visibleSettingsSections(true);

    expect(sections).toContain('organizations');
    expect(sections).toContain('remote-projects');
  });

  it('keeps the sections a released binary always serves', () => {
    for (const id of ['general', 'repos', 'agents', 'mcp'] as const) {
      expect(visibleSettingsSections(false)).toContain(id);
    }
  });
});

describe('resolveInitialSection', () => {
  const available = visibleSettingsSections(false);

  it('falls back to general when the requested section is gated off', () => {
    expect(resolveInitialSection('remote-projects', available)).toBe('general');
    expect(resolveInitialSection('organizations', available)).toBe('general');
  });

  it('honours a requested section that is available', () => {
    expect(resolveInitialSection('agents', available)).toBe('agents');
  });

  it('defaults to general when nothing is requested', () => {
    expect(resolveInitialSection(undefined, available)).toBe('general');
  });

  it('honours remote sections when remote is configured', () => {
    expect(
      resolveInitialSection('remote-projects', visibleSettingsSections(true))
    ).toBe('remote-projects');
  });
});
