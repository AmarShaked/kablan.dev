import type { AvailabilityInfo, BaseCodingAgent } from 'shared/types';

export const CONFIGURED_AGENTS_STORAGE_KEY = 'kablan.configured-agents';

export function isAgentConnected(
  info: AvailabilityInfo | null | undefined
): boolean {
  if (!info) return false;
  return info.type === 'LOGIN_DETECTED' || info.type === 'INSTALLATION_FOUND';
}

export function seedConfiguredAgents(
  defaultAgent: BaseCodingAgent | null | undefined,
  connectedAgents: BaseCodingAgent[]
): BaseCodingAgent[] {
  const seeded = new Set<BaseCodingAgent>(connectedAgents);
  if (defaultAgent) {
    seeded.add(defaultAgent);
  }
  return Array.from(seeded).sort();
}

export function parseStoredConfiguredAgents(
  raw: string | null
): BaseCodingAgent[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === 'object' &&
          'state' in parsed &&
          parsed.state &&
          typeof parsed.state === 'object' &&
          'configured' in parsed.state
        ? (parsed.state as { configured: unknown }).configured
        : null;
    if (!Array.isArray(list)) return null;
    const agents = list.filter(
      (item): item is BaseCodingAgent => typeof item === 'string'
    );
    return agents.length > 0 ? agents : null;
  } catch {
    return null;
  }
}

export function resolveConfiguredAgents({
  persisted,
  stored,
  defaultAgent,
  connectedAgents,
}: {
  persisted: BaseCodingAgent[] | null | undefined;
  stored: BaseCodingAgent[] | null;
  defaultAgent: BaseCodingAgent | null | undefined;
  connectedAgents: BaseCodingAgent[];
}): { agents: BaseCodingAgent[]; shouldPersist: boolean } {
  if (persisted != null) {
    return { agents: persisted, shouldPersist: false };
  }
  if (stored) {
    return { agents: [...stored].sort(), shouldPersist: true };
  }
  return {
    agents: seedConfiguredAgents(defaultAgent, connectedAgents),
    shouldPersist: true,
  };
}

export function filterConnectedProfiles<T>(
  profiles: Record<string, T> | null,
  connectedAgents: BaseCodingAgent[],
  selectedAgent?: string | null
): Record<string, T> | null {
  if (!profiles) return null;
  const allowed = new Set<string>(connectedAgents);
  if (selectedAgent) {
    allowed.add(selectedAgent);
  }
  return Object.fromEntries(
    Object.entries(profiles).filter(([key]) => allowed.has(key))
  );
}
