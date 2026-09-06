import { BaseCodingAgent } from 'shared/types';

export type ProfileFieldGroup = 'behavior' | 'instructions' | 'advanced';

const INSTRUCTION_KEYS = new Set(['append_prompt']);
const ADVANCED_KEYS = new Set([
  'base_command_override',
  'additional_params',
  'env',
]);

export function profileFieldGroup(key: string): ProfileFieldGroup {
  if (INSTRUCTION_KEYS.has(key)) return 'instructions';
  if (ADVANCED_KEYS.has(key)) return 'advanced';
  return 'behavior';
}

type FieldCopy = { label: string; hint: string };

const FIELD_COPY: Record<string, FieldCopy> = {
  model: {
    label: 'Model',
    hint: 'Leave blank for the agent’s default, or pin a specific model.',
  },
  plan: {
    label: 'Plan mode',
    hint: 'Start in plan mode: the agent proposes a plan before it edits files.',
  },
  approvals: {
    label: 'Approvals',
    hint: 'Ask before tools that change things. Plan takes precedence if both are on.',
  },
  dangerously_skip_permissions: {
    label: 'Skip permissions',
    hint: 'Pass --dangerously-skip-permissions so Claude does not prompt. On for DEFAULT because each task already runs in its own worktree.',
  },
  claude_code_router: {
    label: 'Claude Code Router',
    hint: 'Use the community router CLI instead of the official Claude Code package.',
  },
  disable_api_key: {
    label: 'Disable API key',
    hint: 'Do not inject an Anthropic API key. The CLI uses its own login instead.',
  },
  force: {
    label: 'Force',
    hint: 'Allow commands unless they are explicitly denied (--force).',
  },
  yolo: {
    label: 'YOLO',
    hint: 'Auto-approve tool use, including shell. Off on the APPROVALS profile.',
  },
  dangerously_allow_all: {
    label: 'Allow all commands',
    hint: 'Allow all commands to be executed, even if they are not safe.',
  },
  allow_all_tools: {
    label: 'Allow all tools',
    hint: 'Let Copilot use every tool unless a deny list says otherwise.',
  },
  allow_tool: {
    label: 'Allow tool',
    hint: 'A tool name Copilot may always use.',
  },
  deny_tool: {
    label: 'Deny tool',
    hint: 'A tool name Copilot must not use.',
  },
  add_dir: {
    label: 'Extra directories',
    hint: 'Additional directories Copilot may read, one per line.',
  },
  disable_mcp_server: {
    label: 'Disable MCP servers',
    hint: 'MCP server names to turn off, one per line.',
  },
  variant: {
    label: 'Variant',
    hint: 'OpenCode model variant, if the CLI accepts one.',
  },
  agent: {
    label: 'Agent',
    hint: 'Which OpenCode agent personality to run.',
  },
  auto_approve: {
    label: 'Auto-approve',
    hint: 'Auto-approve agent actions.',
  },
  auto_compact: {
    label: 'Auto-compact',
    hint: 'Compact context as it approaches the model window.',
  },
  autonomy: {
    label: 'Autonomy',
    hint: 'Permission level for file and system operations.',
  },
  reasoning_effort: {
    label: 'Reasoning effort',
    hint: 'How hard Droid should think: none, dynamic, off, low, medium, high.',
  },
  append_prompt: {
    label: 'Append prompt',
    hint: 'Extra text added to every task this profile runs. Use it for standing rules, not the task itself.',
  },
  base_command_override: {
    label: 'Base command override',
    hint: 'Replaces the built-in launch command entirely.',
  },
  additional_params: {
    label: 'Additional parameters',
    hint: 'Extra CLI flags appended after the built-in ones, one per line.',
  },
  env: {
    label: 'Environment variables',
    hint: 'Key/value pairs set on the process when this agent runs.',
  },
};

export function profileFieldCopy(
  key: string,
  agent: BaseCodingAgent
): FieldCopy {
  if (key === 'model') {
    switch (agent) {
      case BaseCodingAgent.CURSOR_AGENT:
        return {
          label: 'Model',
          hint: 'Which Cursor model to use. auto, sonnet-4.5, gpt-5, opus-4.1, grok, composer-1, composer-1.5.',
        };
      case BaseCodingAgent.GEMINI:
        return {
          label: 'Model',
          hint: 'Leave blank for Gemini’s default, or set a preview model such as gemini-3-flash-preview.',
        };
      case BaseCodingAgent.CLAUDE_CODE:
        return {
          label: 'Model',
          hint: 'Leave blank to use Claude Code’s default model, or pin one such as claude-sonnet-5.',
        };
      default:
        break;
    }
  }
  return (
    FIELD_COPY[key] ?? {
      label: key.replace(/_/g, ' '),
      hint: '',
    }
  );
}

export function agentBlurb(agent: BaseCodingAgent): string {
  switch (agent) {
    case BaseCodingAgent.CLAUDE_CODE:
      return 'Anthropic Claude';
    case BaseCodingAgent.AMP:
      return 'Sourcegraph Amp';
    case BaseCodingAgent.GEMINI:
      return 'Google Gemini';
    case BaseCodingAgent.OPENCODE:
      return 'Open-source agent';
    case BaseCodingAgent.CURSOR_AGENT:
      return 'Cursor CLI';
    case BaseCodingAgent.QWEN_CODE:
      return 'Alibaba Qwen';
    case BaseCodingAgent.COPILOT:
      return 'GitHub Copilot CLI';
    case BaseCodingAgent.DROID:
      return 'Factory Droid';
  }
}

export function defaultAgentCommand(agent: BaseCodingAgent): string {
  switch (agent) {
    case BaseCodingAgent.CLAUDE_CODE:
      return 'claude';
    case BaseCodingAgent.AMP:
      return 'amp';
    case BaseCodingAgent.GEMINI:
      return 'gemini';
    case BaseCodingAgent.OPENCODE:
      return 'opencode';
    case BaseCodingAgent.CURSOR_AGENT:
      return 'cursor-agent';
    case BaseCodingAgent.QWEN_CODE:
      return 'qwen';
    case BaseCodingAgent.COPILOT:
      return 'copilot';
    case BaseCodingAgent.DROID:
      return 'droid';
  }
}
