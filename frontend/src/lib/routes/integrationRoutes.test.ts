import { describe, expect, it } from 'vitest';
import { IntegrationProvider } from 'shared/types';
import {
  ADD_INTEGRATION_PATH,
  buildIntegrationPath,
  firstIntegrationPath,
  isIntegrationsPath,
  parseIntegrationParam,
} from './integrationRoutes';

describe('buildIntegrationPath', () => {
  it('puts the provider enum in the URL', () => {
    expect(buildIntegrationPath(IntegrationProvider.LINEAR)).toBe(
      '/integrations/LINEAR'
    );
  });
});

describe('parseIntegrationParam', () => {
  it('reads a known provider', () => {
    expect(parseIntegrationParam('LINEAR')).toBe(IntegrationProvider.LINEAR);
  });

  it('rejects junk and the add-integration segment', () => {
    expect(parseIntegrationParam('new')).toBeNull();
    expect(parseIntegrationParam('not-a-provider')).toBeNull();
    expect(parseIntegrationParam(undefined)).toBeNull();
  });
});

describe('isIntegrationsPath', () => {
  it('matches the integrations area and nothing else', () => {
    expect(isIntegrationsPath('/integrations')).toBe(true);
    expect(isIntegrationsPath('/integrations/new')).toBe(true);
    expect(isIntegrationsPath('/integrations/LINEAR')).toBe(true);
    expect(isIntegrationsPath('/settings')).toBe(false);
    expect(isIntegrationsPath('/agents')).toBe(false);
  });
});

describe('firstIntegrationPath', () => {
  it('opens the first enabled integration', () => {
    expect(
      firstIntegrationPath([
        IntegrationProvider.LINEAR,
        IntegrationProvider.JIRA,
      ])
    ).toBe('/integrations/LINEAR');
  });

  it('opens the picker when none are enabled', () => {
    expect(firstIntegrationPath([])).toBe(ADD_INTEGRATION_PATH);
  });
});
