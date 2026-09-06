import { create } from 'zustand';
import type { AvailabilityInfo, BaseCodingAgent } from 'shared/types';
import { configApi } from '@/lib/api';

type AvailabilityMap = Partial<Record<BaseCodingAgent, AvailabilityInfo>>;

type State = {
  availability: AvailabilityMap;
  status: 'idle' | 'loading' | 'ready';
  ensureLoaded: (agents: BaseCodingAgent[]) => Promise<void>;
  refreshAgent: (agent: BaseCodingAgent) => Promise<AvailabilityInfo>;
};

let inFlight: Promise<void> | null = null;

export const useConfiguredAgentsStore = create<State>()((set, get) => ({
  availability: {},
  status: 'idle',
  ensureLoaded: async (agents) => {
    if (get().status === 'ready') return;
    if (inFlight) {
      await inFlight;
      return;
    }

    inFlight = (async () => {
      set({ status: 'loading' });
      const entries = await Promise.all(
        agents.map(async (agent) => {
          try {
            const info = await configApi.checkAgentAvailability(agent);
            return [agent, info] as const;
          } catch {
            return [agent, { type: 'NOT_FOUND' } as AvailabilityInfo] as const;
          }
        })
      );
      set({
        availability: Object.fromEntries(entries) as AvailabilityMap,
        status: 'ready',
      });
    })().finally(() => {
      inFlight = null;
    });

    await inFlight;
  },
  refreshAgent: async (agent) => {
    try {
      const info = await configApi.checkAgentAvailability(agent);
      set({
        availability: { ...get().availability, [agent]: info },
      });
      return info;
    } catch {
      const info = { type: 'NOT_FOUND' } as AvailabilityInfo;
      set({
        availability: { ...get().availability, [agent]: info },
      });
      return info;
    }
  },
}));
