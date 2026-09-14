import { IntegrationProvider } from 'shared/types';

export type IntegrationCatalogItem = {
  provider: IntegrationProvider;
  name: string;
  blurb: string;
  available: boolean;
};

export const INTEGRATION_CATALOG: IntegrationCatalogItem[] = [
  {
    provider: IntegrationProvider.LINEAR,
    name: 'Linear',
    blurb: 'Issues assigned to you, started as Kablan tasks.',
    available: true,
  },
  {
    provider: IntegrationProvider.JIRA,
    name: 'Jira',
    blurb: 'Jira issues assigned to you.',
    available: false,
  },
  {
    provider: IntegrationProvider.GITHUB_ISSUES,
    name: 'GitHub Issues',
    blurb: 'GitHub issues assigned to you.',
    available: false,
  },
  {
    provider: IntegrationProvider.MONDAY,
    name: 'Monday',
    blurb: 'Monday items assigned to you.',
    available: false,
  },
];

export function integrationLabel(provider: IntegrationProvider): string {
  return (
    INTEGRATION_CATALOG.find((item) => item.provider === provider)?.name ??
    provider
  );
}
