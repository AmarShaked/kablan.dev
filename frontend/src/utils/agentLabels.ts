import { BaseCodingAgent } from 'shared/types';

/**
 * How each coding agent is written for people.
 *
 * The backend enum is SCREAMING_SNAKE_CASE, and it used to reach the screen that way — a row
 * reading "CLAUDE_CODE" looks more like an error code than the name of the thing running your task.
 */
export const agentLabels: Record<BaseCodingAgent, string> = {
  [BaseCodingAgent.CLAUDE_CODE]: 'Claude Code',
  [BaseCodingAgent.AMP]: 'Amp',
  [BaseCodingAgent.GEMINI]: 'Gemini',
  [BaseCodingAgent.OPENCODE]: 'OpenCode',
  [BaseCodingAgent.CURSOR_AGENT]: 'Cursor Agent',
  [BaseCodingAgent.QWEN_CODE]: 'Qwen Code',
  [BaseCodingAgent.COPILOT]: 'Copilot',
  [BaseCodingAgent.DROID]: 'Droid',
};

/**
 * The display name for an executor. Falls back to title-casing the raw value, so an agent added
 * to the backend before this map still reads as words rather than as an enum.
 */
export function agentLabel(executor: string | null | undefined): string {
  if (!executor) return 'Agent';
  const known = agentLabels[executor as BaseCodingAgent];
  if (known) return known;
  return executor
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
