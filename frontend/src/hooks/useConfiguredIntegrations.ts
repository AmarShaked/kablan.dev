import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IntegrationProvider } from 'shared/types';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { linearApi } from '@/lib/api';
import { INTEGRATION_CATALOG } from '@/lib/integrations/catalog';
import { linearQueryKeys } from '@/hooks/useLinearIssues';

export function useConfiguredIntegrations() {
  const { config, updateAndSaveConfig, reloadSystem } = useUserSystem();
  const queryClient = useQueryClient();

  const enabledIntegrations = useMemo(
    () => config?.enabled_integrations ?? [],
    [config?.enabled_integrations]
  );

  const connectedIntegrations = useMemo(
    () => config?.connected_integrations ?? [],
    [config?.connected_integrations]
  );

  const unconfiguredIntegrations = useMemo(
    () =>
      INTEGRATION_CATALOG.filter(
        (item) => !enabledIntegrations.includes(item.provider)
      ),
    [enabledIntegrations]
  );

  const addIntegration = async (provider: IntegrationProvider) => {
    if (enabledIntegrations.includes(provider)) return;
    await updateAndSaveConfig({
      enabled_integrations: [...enabledIntegrations, provider],
    });
  };

  const connectIntegration = (provider: IntegrationProvider) => {
    const enabled = enabledIntegrations.includes(provider)
      ? enabledIntegrations
      : [...enabledIntegrations, provider];
    const connected = connectedIntegrations.includes(provider)
      ? connectedIntegrations
      : [...connectedIntegrations, provider];
    void updateAndSaveConfig({
      enabled_integrations: enabled,
      connected_integrations: connected,
    });
  };

  const removeIntegration = async (provider: IntegrationProvider) => {
    if (provider === IntegrationProvider.LINEAR) {
      try {
        await linearApi.disconnect();
      } catch {
        // Fall through to local config cleanup if the key was already gone.
      }
      await queryClient.invalidateQueries({ queryKey: linearQueryKeys.all });
      await reloadSystem();
      return;
    }
    await updateAndSaveConfig({
      enabled_integrations: enabledIntegrations.filter(
        (item) => item !== provider
      ),
      connected_integrations: connectedIntegrations.filter(
        (item) => item !== provider
      ),
    });
  };

  return {
    enabledIntegrations,
    connectedIntegrations,
    unconfiguredIntegrations,
    addIntegration,
    connectIntegration,
    removeIntegration,
    isConnected: (provider: IntegrationProvider) => {
      if (provider === IntegrationProvider.LINEAR) {
        return (
          connectedIntegrations.includes(provider) && !!config?.linear?.api_key
        );
      }
      return connectedIntegrations.includes(provider);
    },
  };
}
