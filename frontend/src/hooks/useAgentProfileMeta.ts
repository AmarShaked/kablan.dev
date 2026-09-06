import { useCallback, useState } from 'react';
import { BaseCodingAgent } from 'shared/types';
import {
  AGENT_PROFILE_META_KEY,
  deleteProfileMeta,
  parseProfileMeta,
  profileDescription,
  renameProfileMeta,
  setProfileDescription,
} from '@/utils/agentProfileMeta';

type MetaMap = ReturnType<typeof parseProfileMeta>;

function readMap(): MetaMap {
  if (typeof window === 'undefined') return {};
  return parseProfileMeta(
    window.localStorage.getItem(AGENT_PROFILE_META_KEY)
  );
}

export function useAgentProfileMeta() {
  const [map, setMap] = useState<MetaMap>(readMap);

  const persist = useCallback((next: MetaMap) => {
    setMap(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        AGENT_PROFILE_META_KEY,
        JSON.stringify(next)
      );
    }
  }, []);

  const descriptionOf = useCallback(
    (agent: BaseCodingAgent, profile: string) =>
      profileDescription(map, agent, profile),
    [map]
  );

  const saveDescription = useCallback(
    (agent: BaseCodingAgent, profile: string, description: string) => {
      persist(setProfileDescription(map, agent, profile, description));
    },
    [map, persist]
  );

  const rename = useCallback(
    (agent: BaseCodingAgent, from: string, to: string) => {
      persist(renameProfileMeta(map, agent, from, to));
    },
    [map, persist]
  );

  const remove = useCallback(
    (agent: BaseCodingAgent, profile: string) => {
      persist(deleteProfileMeta(map, agent, profile));
    },
    [map, persist]
  );

  return { descriptionOf, saveDescription, rename, remove };
}
