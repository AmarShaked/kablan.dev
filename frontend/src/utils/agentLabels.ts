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

/**
 * The command a person types in their own terminal to sign an agent in.
 *
 * This is deliberately not the command Kablan runs — Kablan mostly shells out through `npx` with a
 * pinned version, which is not something to tell someone to type. Signing in happens in the
 * interactive CLI, so these are the interactive entry points.
 */
export const agentSignInCommands: Record<BaseCodingAgent, string> = {
  [BaseCodingAgent.CLAUDE_CODE]: 'claude',
  [BaseCodingAgent.AMP]: 'amp',
  [BaseCodingAgent.GEMINI]: 'gemini',
  [BaseCodingAgent.OPENCODE]: 'opencode',
  [BaseCodingAgent.CURSOR_AGENT]: 'cursor-agent',
  [BaseCodingAgent.QWEN_CODE]: 'qwen',
  [BaseCodingAgent.COPILOT]: 'copilot',
  [BaseCodingAgent.DROID]: 'droid',
};

/**
 * The sign-in command for an executor, or `null` when we don't know one. Callers must handle
 * `null` rather than guess: naming the wrong command is worse than naming none, because the user
 * will type it.
 */
export function agentSignInCommand(
  executor: string | null | undefined
): string | null {
  if (!executor) return null;
  return agentSignInCommands[executor as BaseCodingAgent] ?? null;
}

/**
 * Where to send someone who doesn't have the agent's CLI yet.
 *
 * Each of these is already cited by Kablan's own docs under `docs/agents/`, so they move together
 * rather than drifting apart.
 */
export const agentInstallUrls: Record<BaseCodingAgent, string> = {
  [BaseCodingAgent.CLAUDE_CODE]:
    'https://docs.claude.com/en/docs/claude-code/quickstart',
  [BaseCodingAgent.AMP]: 'https://ampcode.com/manual#install',
  [BaseCodingAgent.GEMINI]: 'https://geminicli.com/',
  [BaseCodingAgent.OPENCODE]: 'https://github.com/sst/opencode',
  [BaseCodingAgent.CURSOR_AGENT]: 'https://docs.cursor.com/en/cli/installation',
  [BaseCodingAgent.QWEN_CODE]: 'https://github.com/QwenLM/qwen-code',
  [BaseCodingAgent.COPILOT]:
    'https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli',
  [BaseCodingAgent.DROID]: 'https://factory.ai/product/cli',
};

/** The install page for an executor, or `null` when we don't have one to point at. */
export function agentInstallUrl(
  executor: string | null | undefined
): string | null {
  if (!executor) return null;
  return agentInstallUrls[executor as BaseCodingAgent] ?? null;
}
