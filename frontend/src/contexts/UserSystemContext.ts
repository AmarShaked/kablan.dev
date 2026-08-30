import { createContext, useContext } from 'react';

import type {
  BaseAgentCapability,
  Environment,
  ExecutorConfig,
  LoginStatus,
} from 'shared/types';
import type { Config } from 'shared/types';

interface UserSystemState {
  config: Config | null;
  environment: Environment | null;
  profiles: Record<string, ExecutorConfig> | null;
  capabilities: Record<string, BaseAgentCapability[]> | null;
  analyticsUserId: string | null;
  loginStatus: LoginStatus | null;
}

export interface UserSystemContextType {
  // Full system state
  system: UserSystemState;

  // Hot path - config helpers (most frequently used)
  config: Config | null;
  updateConfig: (updates: Partial<Config>) => void;
  updateAndSaveConfig: (updates: Partial<Config>) => Promise<boolean>;
  saveConfig: () => Promise<boolean>;

  // System data access
  environment: Environment | null;
  profiles: Record<string, ExecutorConfig> | null;
  capabilities: Record<string, BaseAgentCapability[]> | null;
  analyticsUserId: string | null;
  loginStatus: LoginStatus | null;
  setEnvironment: (env: Environment | null) => void;
  setProfiles: (profiles: Record<string, ExecutorConfig> | null) => void;
  setCapabilities: (caps: Record<string, BaseAgentCapability[]> | null) => void;

  // Reload system data
  reloadSystem: () => Promise<void>;

  // State
  loading: boolean;
}

/**
 * The context lives here rather than beside its provider, and this module exports no component.
 *
 * A module that exports both a component and something else is not eligible for Fast Refresh, so
 * editing ConfigProvider — or any file whose update propagated up to it — re-evaluated it and
 * built a *new* context object, while components already on screen still read the old one. The
 * result was "useUserSystem must be used within a UserSystemProvider" on almost every save, from
 * a tree that plainly had the provider in it. Keeping the context in a module of its own gives it
 * a stable identity across those updates.
 */
export const UserSystemContext = createContext<UserSystemContextType | undefined>(
  undefined
);

export function useUserSystem() {
  const context = useContext(UserSystemContext);
  if (context === undefined) {
    throw new Error('useUserSystem must be used within a UserSystemProvider');
  }
  return context;
}
