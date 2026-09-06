import { useEffect, useMemo, useRef } from 'react';
import type { BaseCodingAgent, ExecutorConfig } from 'shared/types';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { useConfiguredAgentsStore } from '@/stores/useConfiguredAgentsStore';
import {
  CONFIGURED_AGENTS_STORAGE_KEY,
  filterConnectedProfiles,
  isAgentConnected,
  parseStoredConfiguredAgents,
  resolveConfiguredAgents,
} from '@/utils/configuredAgents';

export function useConfiguredAgents() {
  const { config, profiles, updateAndSaveConfig } = useUserSystem();
  const availability = useConfiguredAgentsStore((s) => s.availability);
  const status = useConfiguredAgentsStore((s) => s.status);
  const ensureLoaded = useConfiguredAgentsStore((s) => s.ensureLoaded);

  const knownAgents = useMemo(
    () => (profiles ? (Object.keys(profiles).sort() as BaseCodingAgent[]) : []),
    [profiles]
  );

  useEffect(() => {
    if (knownAgents.length === 0) return;
    void ensureLoaded(knownAgents);
  }, [knownAgents, ensureLoaded]);

  const connectedDetected = useMemo(
    () => knownAgents.filter((agent) => isAgentConnected(availability[agent])),
    [knownAgents, availability]
  );

  const { agents: resolvedAgents, shouldPersist } = useMemo(() => {
    const persisted = config?.enabled_agents;
    if (persisted != null) {
      return { agents: persisted, shouldPersist: false };
    }
    if (status !== 'ready') {
      return { agents: [] as BaseCodingAgent[], shouldPersist: false };
    }
    const stored =
      typeof window === 'undefined'
        ? null
        : parseStoredConfiguredAgents(
            window.sessionStorage.getItem(CONFIGURED_AGENTS_STORAGE_KEY)
          );
    return resolveConfiguredAgents({
      persisted,
      stored,
      defaultAgent: config?.executor_profile?.executor,
      connectedAgents: connectedDetected,
    });
  }, [
    config?.enabled_agents,
    config?.executor_profile?.executor,
    status,
    connectedDetected,
  ]);

  const configuredAgents = useMemo(
    () => resolvedAgents.filter((agent) => knownAgents.includes(agent)),
    [resolvedAgents, knownAgents]
  );

  const persistAttempted = useRef(false);

  useEffect(() => {
    if (!shouldPersist || !config || persistAttempted.current) return;
    persistAttempted.current = true;
    void updateAndSaveConfig({ enabled_agents: configuredAgents }).then(
      (saved) => {
        if (!saved) {
          persistAttempted.current = false;
          return;
        }
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(CONFIGURED_AGENTS_STORAGE_KEY);
        }
      }
    );
  }, [shouldPersist, configuredAgents, config, updateAndSaveConfig]);

  const connectedAgents = useMemo(
    () =>
      configuredAgents.filter((agent) => isAgentConnected(availability[agent])),
    [configuredAgents, availability]
  );

  const unconfiguredAgents = useMemo(
    () => knownAgents.filter((agent) => !configuredAgents.includes(agent)),
    [knownAgents, configuredAgents]
  );

  const connectedProfiles = useMemo(
    () =>
      filterConnectedProfiles(
        profiles as Record<string, ExecutorConfig> | null,
        connectedAgents
      ),
    [profiles, connectedAgents]
  );

  const addAgent = (agent: BaseCodingAgent) => {
    if (configuredAgents.includes(agent)) return;
    void updateAndSaveConfig({
      enabled_agents: [...configuredAgents, agent].sort(),
    });
  };

  const removeAgent = (agent: BaseCodingAgent) => {
    void updateAndSaveConfig({
      enabled_agents: configuredAgents.filter((item) => item !== agent),
    });
  };

  return {
    configuredAgents,
    connectedAgents,
    unconfiguredAgents,
    connectedProfiles,
    availability,
    isLoading: status !== 'ready',
    addAgent,
    removeAgent,
    isConnected: (agent: BaseCodingAgent) =>
      isAgentConnected(availability[agent]),
  };
}
