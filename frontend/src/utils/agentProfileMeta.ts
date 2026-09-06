import { BaseCodingAgent } from 'shared/types';

export const AGENT_PROFILE_META_KEY = 'kablan.agent-profile-meta';

export type ProfileMeta = {
  description: string;
};

type MetaMap = Partial<
  Record<BaseCodingAgent, Record<string, ProfileMeta>>
>;

export function defaultProfileDescription(name: string): string {
  switch (name) {
    case 'DEFAULT':
      return 'Everyday run';
    case 'PLAN':
      return 'Plan before editing';
    case 'APPROVALS':
      return 'Ask before tools';
    case 'FLASH':
      return 'Faster Gemini model';
    case 'COMPOSER_1':
      return 'Composer 1';
    case 'COMPOSER_1_5':
      return 'Composer 1.5';
    default:
      return 'Custom setup';
  }
}

export function parseProfileMeta(raw: string | null): MetaMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as MetaMap;
  } catch {
    return {};
  }
}

export function profileDescription(
  map: MetaMap,
  agent: BaseCodingAgent,
  profile: string
): string {
  return (
    map[agent]?.[profile]?.description ?? defaultProfileDescription(profile)
  );
}

export function setProfileDescription(
  map: MetaMap,
  agent: BaseCodingAgent,
  profile: string,
  description: string
): MetaMap {
  return {
    ...map,
    [agent]: {
      ...map[agent],
      [profile]: { description },
    },
  };
}

export function renameProfileMeta(
  map: MetaMap,
  agent: BaseCodingAgent,
  from: string,
  to: string
): MetaMap {
  const current = map[agent];
  if (!current || from === to) return map;
  const next = { ...current };
  if (next[from] && !next[to]) {
    next[to] = next[from];
  }
  delete next[from];
  return { ...map, [agent]: next };
}

export function deleteProfileMeta(
  map: MetaMap,
  agent: BaseCodingAgent,
  profile: string
): MetaMap {
  const current = map[agent];
  if (!current) return map;
  const next = { ...current };
  delete next[profile];
  return { ...map, [agent]: next };
}
