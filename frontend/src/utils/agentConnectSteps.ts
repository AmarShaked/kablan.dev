import { BaseCodingAgent } from 'shared/types';

export type AgentConnectStep = {
  n: string;
  title: string;
  body: string;
  command?: string;
};

export function agentConnectSteps(agent: BaseCodingAgent): AgentConnectStep[] {
  switch (agent) {
    case BaseCodingAgent.CLAUDE_CODE:
      return [
        {
          n: '1',
          title: 'Install Claude Code',
          body: 'Install the Claude Code CLI on this machine.',
          command: 'npm i -g @anthropic-ai/claude-code',
        },
        {
          n: '2',
          title: 'Sign in',
          body: 'Run this in a terminal and complete the Anthropic login.',
          command: 'claude',
        },
        {
          n: '3',
          title: 'Check connection',
          body: 'Kablan looks for ~/.claude.json. Come back here and check again.',
        },
      ];
    case BaseCodingAgent.CURSOR_AGENT:
      return [
        {
          n: '1',
          title: 'Install Cursor Agent',
          body: 'Install the CLI so cursor-agent is on your PATH.',
        },
        {
          n: '2',
          title: 'Sign in',
          body: 'Run this in a terminal, or set CURSOR_API_KEY instead.',
          command: 'cursor-agent login',
        },
        {
          n: '3',
          title: 'Check connection',
          body: 'Kablan looks for the cursor-agent binary and ~/.cursor/mcp.json.',
        },
      ];
    case BaseCodingAgent.GEMINI:
      return [
        {
          n: '1',
          title: 'Install Gemini CLI',
          body: 'Install the Gemini CLI on this machine.',
          command: 'npm i -g @google/gemini-cli',
        },
        {
          n: '2',
          title: 'Sign in',
          body: 'Run this in a terminal and complete the Google login.',
          command: 'gemini',
        },
        {
          n: '3',
          title: 'Check connection',
          body: 'Kablan looks for ~/.gemini/oauth_creds.json. Come back here and check again.',
        },
      ];
    case BaseCodingAgent.AMP:
      return [
        {
          n: '1',
          title: 'Install Amp',
          body: 'Install the Amp CLI so amp is on your PATH.',
        },
        {
          n: '2',
          title: 'Sign in',
          body: 'Run Amp once and complete login.',
          command: 'amp',
        },
        {
          n: '3',
          title: 'Check connection',
          body: 'Come back here and check again once Amp is signed in.',
        },
      ];
    case BaseCodingAgent.OPENCODE:
      return [
        {
          n: '1',
          title: 'Install OpenCode',
          body: 'Install the OpenCode CLI on this machine.',
        },
        {
          n: '2',
          title: 'Sign in',
          body: 'Run OpenCode once so it can store credentials.',
          command: 'opencode',
        },
        {
          n: '3',
          title: 'Check connection',
          body: 'Come back here and check again once OpenCode is available.',
        },
      ];
    case BaseCodingAgent.COPILOT:
      return [
        {
          n: '1',
          title: 'Install Copilot CLI',
          body: 'Install the GitHub Copilot CLI on this machine.',
        },
        {
          n: '2',
          title: 'Sign in',
          body: 'Run this in a terminal and complete GitHub login.',
          command: 'gh copilot',
        },
        {
          n: '3',
          title: 'Check connection',
          body: 'Come back here and check again once Copilot is signed in.',
        },
      ];
    case BaseCodingAgent.QWEN_CODE:
      return [
        {
          n: '1',
          title: 'Install Qwen Code',
          body: 'Install the Qwen Code CLI on this machine.',
        },
        {
          n: '2',
          title: 'Sign in',
          body: 'Run Qwen Code once and complete login.',
          command: 'qwen',
        },
        {
          n: '3',
          title: 'Check connection',
          body: 'Come back here and check again once Qwen Code is available.',
        },
      ];
    case BaseCodingAgent.DROID:
      return [
        {
          n: '1',
          title: 'Install Droid',
          body: 'Install the Factory Droid CLI on this machine.',
        },
        {
          n: '2',
          title: 'Sign in',
          body: 'Run Droid once and complete login.',
          command: 'droid',
        },
        {
          n: '3',
          title: 'Check connection',
          body: 'Come back here and check again once Droid is signed in.',
        },
      ];
  }
}
