import type { BaseCodingAgent } from 'shared/types';
import { BaseCodingAgent as Agent } from 'shared/types';

/** Per-agent chip/avatar tones from the platform palette. */
export type AgentChatTone = {
  avatar: string;
  mention: string;
  name: string;
};

const TONES: Record<BaseCodingAgent, AgentChatTone> = {
  [Agent.CLAUDE_CODE]: {
    avatar: 'bg-warning/15 text-warning',
    mention: 'bg-warning/20 text-warning',
    name: 'text-warning',
  },
  [Agent.CURSOR_AGENT]: {
    avatar: 'bg-info/15 text-info',
    mention: 'bg-info/20 text-info',
    name: 'text-info',
  },
  [Agent.GEMINI]: {
    avatar: 'bg-success/15 text-success',
    mention: 'bg-success/20 text-success',
    name: 'text-success',
  },
  [Agent.AMP]: {
    avatar: 'bg-primary/10 text-foreground',
    mention: 'bg-primary/10 text-foreground',
    name: 'text-foreground',
  },
  [Agent.OPENCODE]: {
    avatar: 'bg-success/15 text-success',
    mention: 'bg-success/20 text-success',
    name: 'text-success',
  },
  [Agent.QWEN_CODE]: {
    avatar: 'bg-info/15 text-info',
    mention: 'bg-info/20 text-info',
    name: 'text-info',
  },
  [Agent.COPILOT]: {
    avatar: 'bg-warning/15 text-warning',
    mention: 'bg-warning/20 text-warning',
    name: 'text-warning',
  },
  [Agent.DROID]: {
    avatar: 'bg-primary/10 text-foreground',
    mention: 'bg-primary/10 text-foreground',
    name: 'text-foreground',
  },
};

const FALLBACK: AgentChatTone = {
  avatar: 'bg-muted text-muted-foreground',
  mention: 'bg-warning/20 text-warning',
  name: 'text-foreground',
};

export function agentChatTone(
  agent: BaseCodingAgent | string | null | undefined
): AgentChatTone {
  if (!agent) return FALLBACK;
  return TONES[agent as BaseCodingAgent] ?? FALLBACK;
}
