import type { TaskAcrossProjects } from '@/hooks/useAllTasks';

const now = Date.now();
const ago = (minutes: number) =>
  new Date(now - minutes * 60_000).toISOString();

const MOCK_PROJECTS = {
  api: {
    id: 'mock-proj-api',
    name: 'api',
    icon: 'server',
  },
  web: {
    id: 'mock-proj-web',
    name: 'web',
    icon: 'globe',
  },
  infra: {
    id: 'mock-proj-infra',
    name: 'infra',
    icon: 'cloud',
  },
} as const;

function mockTask(
  partial: Partial<TaskAcrossProjects> &
    Pick<
      TaskAcrossProjects,
      | 'id'
      | 'title'
      | 'status'
      | 'projectId'
      | 'projectName'
      | 'projectIcon'
    >
): TaskAcrossProjects {
  return {
    has_in_progress_attempt: false,
    last_attempt_failed: false,
    has_running_dev_server: false,
    has_unseen_turns: false,
    last_turn_summary: null,
    last_turn_prompt: null,
    executor: 'CLAUDE_CODE',
    project_id: partial.projectId,
    description: null,
    parent_workspace_id: null,
    archived_at: null,
    created_at: ago(120),
    updated_at: ago(5),
    source_provider: null,
    source_id: null,
    source_identifier: null,
    source_url: null,
    ...partial,
  };
}

/** Demo ring for `/warzone?mock=1` — not persisted, not sent to the API. */
export const WARZONE_MOCK_TASKS: TaskAcrossProjects[] = [
  mockTask({
    id: 'mock-task-1',
    title: 'Auth middleware',
    status: 'inprogress',
    projectId: MOCK_PROJECTS.api.id,
    projectName: MOCK_PROJECTS.api.name,
    projectIcon: MOCK_PROJECTS.api.icon,
    has_in_progress_attempt: true,
    last_turn_prompt: 'Add JWT validation to the gateway',
    last_turn_summary: 'Reading routes and session helpers…',
    updated_at: ago(1),
  }),
  mockTask({
    id: 'mock-task-2',
    title: 'Fix flaky CI',
    status: 'inreview',
    projectId: MOCK_PROJECTS.api.id,
    projectName: MOCK_PROJECTS.api.name,
    projectIcon: MOCK_PROJECTS.api.icon,
    has_unseen_turns: true,
    last_turn_prompt: 'tests flake in auth suite on CI',
    last_turn_summary:
      'Found race in session cleanup. Patch applied to session.rs. Ready for review — open the PR?',
    updated_at: ago(3),
  }),
  mockTask({
    id: 'mock-task-3',
    title: 'Migrate tags',
    status: 'inprogress',
    projectId: MOCK_PROJECTS.web.id,
    projectName: MOCK_PROJECTS.web.name,
    projectIcon: MOCK_PROJECTS.web.icon,
    has_in_progress_attempt: true,
    last_turn_prompt: 'Move project tags into the new schema',
    last_turn_summary: 'Editing migration and updating queries…',
    updated_at: ago(2),
  }),
  mockTask({
    id: 'mock-task-4',
    title: 'PR review notes',
    status: 'inreview',
    projectId: MOCK_PROJECTS.web.id,
    projectName: MOCK_PROJECTS.web.name,
    projectIcon: MOCK_PROJECTS.web.icon,
    has_unseen_turns: true,
    last_turn_prompt: 'Summarise the open PR comments',
    last_turn_summary: 'Three blockers left on the sidebar polish PR.',
    updated_at: ago(8),
  }),
  mockTask({
    id: 'mock-task-5',
    title: 'Linear sync',
    status: 'inprogress',
    projectId: MOCK_PROJECTS.web.id,
    projectName: MOCK_PROJECTS.web.name,
    projectIcon: MOCK_PROJECTS.web.icon,
    has_in_progress_attempt: true,
    last_turn_prompt: 'Wire inbox filters to Linear GraphQL',
    last_turn_summary: 'Working through pagination cursors…',
    updated_at: ago(4),
  }),
  mockTask({
    id: 'mock-task-6',
    title: 'Deploy script',
    status: 'inprogress',
    projectId: MOCK_PROJECTS.infra.id,
    projectName: MOCK_PROJECTS.infra.name,
    projectIcon: MOCK_PROJECTS.infra.icon,
    last_attempt_failed: true,
    last_turn_prompt: 'Fix the staging deploy hook',
    last_turn_summary: 'Script exited 1 — missing AWS credentials in CI.',
    updated_at: ago(12),
  }),
  mockTask({
    id: 'mock-task-7',
    title: 'API types',
    status: 'inprogress',
    projectId: MOCK_PROJECTS.api.id,
    projectName: MOCK_PROJECTS.api.name,
    projectIcon: MOCK_PROJECTS.api.icon,
    has_in_progress_attempt: true,
    last_turn_prompt: 'Regenerate ts-rs types after the route change',
    last_turn_summary: 'Running generate-types…',
    updated_at: ago(6),
  }),
  mockTask({
    id: 'mock-task-8',
    title: 'Sidebar polish',
    status: 'inreview',
    projectId: MOCK_PROJECTS.web.id,
    projectName: MOCK_PROJECTS.web.name,
    projectIcon: MOCK_PROJECTS.web.icon,
    has_unseen_turns: true,
    last_turn_prompt: 'Tighten spacing under the CTA',
    last_turn_summary: 'Warzone link moved; waiting on your eye for the separator.',
    updated_at: ago(15),
  }),
  mockTask({
    id: 'mock-task-9',
    title: 'MCP tools',
    status: 'inprogress',
    projectId: MOCK_PROJECTS.api.id,
    projectName: MOCK_PROJECTS.api.name,
    projectIcon: MOCK_PROJECTS.api.icon,
    has_in_progress_attempt: true,
    last_turn_prompt: 'Add Playwright MCP one-click install',
    last_turn_summary: 'Updating the MCP settings panel…',
    updated_at: ago(7),
  }),
  mockTask({
    id: 'mock-task-10',
    title: 'Terraform plan',
    status: 'inreview',
    projectId: MOCK_PROJECTS.infra.id,
    projectName: MOCK_PROJECTS.infra.name,
    projectIcon: MOCK_PROJECTS.infra.icon,
    has_unseen_turns: true,
    last_turn_prompt: 'Review the staging VPC change',
    last_turn_summary: 'Plan looks clean — two new subnets, no destroy.',
    updated_at: ago(20),
  }),
  mockTask({
    id: 'mock-task-11',
    title: 'Docs pass',
    status: 'inreview',
    projectId: MOCK_PROJECTS.web.id,
    projectName: MOCK_PROJECTS.web.name,
    projectIcon: MOCK_PROJECTS.web.icon,
    has_unseen_turns: true,
    last_turn_prompt: 'Update README install section',
    last_turn_summary: 'Draft ready — screenshots still TODO.',
    updated_at: ago(25),
  }),
  mockTask({
    id: 'mock-task-12',
    title: 'Rate limit footer',
    status: 'inprogress',
    projectId: MOCK_PROJECTS.web.id,
    projectName: MOCK_PROJECTS.web.name,
    projectIcon: MOCK_PROJECTS.web.icon,
    has_in_progress_attempt: true,
    last_turn_prompt: 'Show Claude usage windows in the sidebar',
    last_turn_summary: 'Parsing CLI /usage output…',
    updated_at: ago(9),
  }),
];

export type WarzoneMockChatLine = {
  role: 'you' | 'agent' | 'tool';
  text: string;
};

/** Short centre transcripts keyed by mock task id. */
export const WARZONE_MOCK_CHATS: Record<string, WarzoneMockChatLine[]> = {
  'mock-task-1': [
    { role: 'you', text: 'Add JWT validation to the gateway' },
    { role: 'tool', text: 'Read crates/server/src/routes/oauth.rs' },
    { role: 'agent', text: 'Reading routes and session helpers…' },
  ],
  'mock-task-2': [
    { role: 'you', text: 'tests flake in auth suite on CI' },
    { role: 'tool', text: 'Read session.rs' },
    { role: 'tool', text: 'Edit session.rs' },
    {
      role: 'agent',
      text: 'Found race in session cleanup. Patch applied. Ready for review — want me to open the PR?',
    },
  ],
  'mock-task-3': [
    { role: 'you', text: 'Move project tags into the new schema' },
    { role: 'tool', text: 'Edit migrations/…_tags.sql' },
    { role: 'agent', text: 'Editing migration and updating queries…' },
  ],
  'mock-task-4': [
    { role: 'you', text: 'Summarise the open PR comments' },
    {
      role: 'agent',
      text: 'Three blockers left on the sidebar polish PR.',
    },
  ],
  'mock-task-5': [
    { role: 'you', text: 'Wire inbox filters to Linear GraphQL' },
    { role: 'agent', text: 'Working through pagination cursors…' },
  ],
  'mock-task-6': [
    { role: 'you', text: 'Fix the staging deploy hook' },
    {
      role: 'agent',
      text: 'Script exited 1 — missing AWS credentials in CI.',
    },
  ],
  'mock-task-7': [
    { role: 'you', text: 'Regenerate ts-rs types after the route change' },
    { role: 'agent', text: 'Running generate-types…' },
  ],
  'mock-task-8': [
    { role: 'you', text: 'Tighten spacing under the CTA' },
    {
      role: 'agent',
      text: 'Warzone link moved; waiting on your eye for the separator.',
    },
  ],
  'mock-task-9': [
    { role: 'you', text: 'Add Playwright MCP one-click install' },
    { role: 'agent', text: 'Updating the MCP settings panel…' },
  ],
  'mock-task-10': [
    { role: 'you', text: 'Review the staging VPC change' },
    {
      role: 'agent',
      text: 'Plan looks clean — two new subnets, no destroy.',
    },
  ],
  'mock-task-11': [
    { role: 'you', text: 'Update README install section' },
    { role: 'agent', text: 'Draft ready — screenshots still TODO.' },
  ],
  'mock-task-12': [
    { role: 'you', text: 'Show Claude usage windows in the sidebar' },
    { role: 'agent', text: 'Parsing CLI /usage output…' },
  ],
};

export function isWarzoneMockTaskId(id: string | null | undefined): boolean {
  return !!id && id.startsWith('mock-task-');
}

export const WARZONE_MOCK_PROJECT_CHIPS = [
  { id: MOCK_PROJECTS.api.id, name: MOCK_PROJECTS.api.name },
  { id: MOCK_PROJECTS.web.id, name: MOCK_PROJECTS.web.name },
  { id: MOCK_PROJECTS.infra.id, name: MOCK_PROJECTS.infra.name },
];
