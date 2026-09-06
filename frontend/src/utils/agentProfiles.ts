import type { BaseCodingAgent, ExecutorConfigs } from 'shared/types';

type ExecutorsMap = Record<string, Record<string, Record<string, unknown>>>;

function asMap(profiles: ExecutorConfigs): ExecutorsMap {
  return profiles.executors as unknown as ExecutorsMap;
}

export function profileNames(
  profiles: ExecutorConfigs | null | undefined,
  agent: BaseCodingAgent
): string[] {
  if (!profiles) return [];
  return Object.keys(asMap(profiles)[agent] ?? {});
}

export function profileFormData(
  profiles: ExecutorConfigs | null | undefined,
  agent: BaseCodingAgent,
  name: string
): Record<string, unknown> {
  if (!profiles) return {};
  const data = asMap(profiles)[agent]?.[name]?.[agent];
  return data && typeof data === 'object'
    ? { ...(data as Record<string, unknown>) }
    : {};
}

export function setProfileFormData(
  profiles: ExecutorConfigs,
  agent: BaseCodingAgent,
  name: string,
  formData: Record<string, unknown>
): ExecutorConfigs {
  const map = asMap(profiles);
  return {
    ...profiles,
    executors: {
      ...profiles.executors,
      [agent]: {
        ...map[agent],
        [name]: { [agent]: formData },
      },
    },
  };
}

export function createProfile(
  profiles: ExecutorConfigs,
  agent: BaseCodingAgent,
  name: string,
  cloneFrom?: string | null
): ExecutorConfigs {
  const map = asMap(profiles);
  const sourceName = cloneFrom ?? profileNames(profiles, agent)[0];
  const base = sourceName
    ? profileFormData(profiles, agent, sourceName)
    : {};
  return {
    ...profiles,
    executors: {
      ...profiles.executors,
      [agent]: {
        ...map[agent],
        [name]: { [agent]: { ...base } },
      },
    },
  };
}

export function renameProfile(
  profiles: ExecutorConfigs,
  agent: BaseCodingAgent,
  from: string,
  to: string
): ExecutorConfigs {
  if (from === to) return profiles;
  const current = asMap(profiles)[agent];
  if (!current?.[from] || current[to]) return profiles;
  const next = { ...current };
  next[to] = next[from];
  delete next[from];
  return {
    ...profiles,
    executors: {
      ...profiles.executors,
      [agent]: next,
    },
  };
}

export function deleteProfile(
  profiles: ExecutorConfigs,
  agent: BaseCodingAgent,
  name: string
): ExecutorConfigs {
  const current = asMap(profiles)[agent];
  if (!current?.[name] || Object.keys(current).length <= 1) {
    return profiles;
  }
  const next = { ...current };
  delete next[name];
  return {
    ...profiles,
    executors: {
      ...profiles.executors,
      [agent]: next,
    },
  };
}

export function nextUntitledName(existing: string[]): string {
  if (!existing.includes('Untitled')) return 'Untitled';
  let n = 2;
  while (existing.includes(`Untitled_${n}`)) n += 1;
  return `Untitled_${n}`;
}

export function validateProfileName(
  name: string,
  existing: string[],
  current?: string
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Name cannot be empty';
  if (trimmed.length > 40) return 'Name must be 40 characters or less';
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return 'Letters, numbers, hyphens and underscores only';
  }
  if (existing.includes(trimmed) && trimmed !== current) {
    return 'A profile with this name already exists';
  }
  return null;
}
