import { BaseCodingAgent } from 'shared/types';

export const ADD_AGENT_PATH = '/agents/new';
export const SETTINGS_AGENTS_REDIRECT = '/agents';
export const SETTINGS_USAGE_REDIRECT = `/agents/${BaseCodingAgent.CLAUDE_CODE}`;

const AGENTS = new Set<string>(Object.values(BaseCodingAgent));

export function buildAgentPath(agent: BaseCodingAgent): string {
  return `/agents/${agent}`;
}

export function firstAgentPath(configured: BaseCodingAgent[]): string {
  return configured[0] ? buildAgentPath(configured[0]) : ADD_AGENT_PATH;
}

export function parseAgentParam(
  raw: string | undefined
): BaseCodingAgent | null {
  if (!raw || !AGENTS.has(raw)) return null;
  return raw as BaseCodingAgent;
}

export function isAgentsPath(pathname: string): boolean {
  return pathname === '/agents' || pathname.startsWith('/agents/');
}
