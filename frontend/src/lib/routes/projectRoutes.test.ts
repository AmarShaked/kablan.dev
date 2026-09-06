import { describe, expect, it } from 'vitest';
import {
  buildProjectSettingsPath,
  isProjectSettingsPath,
  settingsProjectsRedirectTo,
  settingsReposRedirectTo,
} from './projectRoutes';

describe('buildProjectSettingsPath', () => {
  it('puts the project under /local-projects/.../settings', () => {
    expect(
      buildProjectSettingsPath('11111111-1111-1111-1111-111111111111')
    ).toBe('/local-projects/11111111-1111-1111-1111-111111111111/settings');
  });

  it('can name the repository to open on that page', () => {
    expect(
      buildProjectSettingsPath(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222'
      )
    ).toBe(
      '/local-projects/11111111-1111-1111-1111-111111111111/settings?repo=22222222-2222-2222-2222-222222222222'
    );
  });
});

describe('isProjectSettingsPath', () => {
  it('matches a project settings page and nothing else', () => {
    expect(
      isProjectSettingsPath(
        '/local-projects/11111111-1111-1111-1111-111111111111/settings'
      )
    ).toBe(true);
    expect(
      isProjectSettingsPath(
        '/local-projects/11111111-1111-1111-1111-111111111111/tasks'
      )
    ).toBe(false);
    expect(isProjectSettingsPath('/settings/projects')).toBe(false);
  });
});

describe('settingsProjectsRedirectTo', () => {
  it('sends a projectId query at that project’s settings page', () => {
    expect(
      settingsProjectsRedirectTo(
        '?projectId=11111111-1111-1111-1111-111111111111'
      )
    ).toBe('/local-projects/11111111-1111-1111-1111-111111111111/settings');
  });

  it('sends a bare Projects tab at the projects list', () => {
    expect(settingsProjectsRedirectTo('')).toBe('/local-projects');
  });
});

describe('settingsReposRedirectTo', () => {
  it('sends a bare Repositories tab at the projects list', () => {
    expect(settingsReposRedirectTo('')).toBe('/local-projects');
  });
});
