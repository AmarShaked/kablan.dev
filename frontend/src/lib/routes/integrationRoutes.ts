import { IntegrationProvider } from 'shared/types';

export const ADD_INTEGRATION_PATH = '/integrations/new';

const PROVIDERS = new Set<string>(Object.values(IntegrationProvider));

export function buildIntegrationPath(provider: IntegrationProvider): string {
  return `/integrations/${provider}`;
}

export function firstIntegrationPath(enabled: IntegrationProvider[]): string {
  return enabled[0] ? buildIntegrationPath(enabled[0]) : ADD_INTEGRATION_PATH;
}

export function parseIntegrationParam(
  raw: string | undefined
): IntegrationProvider | null {
  if (!raw || !PROVIDERS.has(raw)) return null;
  return raw as IntegrationProvider;
}

export function isIntegrationsPath(pathname: string): boolean {
  return pathname === '/integrations' || pathname.startsWith('/integrations/');
}
