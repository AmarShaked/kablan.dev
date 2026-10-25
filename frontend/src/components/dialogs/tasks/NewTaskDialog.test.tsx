import * as React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import NiceModal from '@ebay/nice-modal-react';

const repos = [
  { id: 'repo-1', display_name: 'repo one', default_target_branch: 'main' },
];

let branchesReady = false;
const branchListeners = new Set<() => void>();
const deliverBranches = () => {
  branchesReady = true;
  branchListeners.forEach((cb) => cb());
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/contexts/UserSystemContext', () => ({
  useUserSystem: () => ({
    system: {
      config: {
        last_agent_selection: {
          executor: 'CLAUDE_CODE',
          model: null,
          permission: 'BYPASS',
        },
      },
    },
    loading: false,
  }),
}));

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({
    projects: [
      { id: 'project-1', name: 'Project One', icon: null },
      { id: 'project-2', name: 'Project Two', icon: null },
    ],
  }),
}));

const createAndStart = vi.fn().mockResolvedValue({ id: 'task-1' });

vi.mock('@/hooks', () => ({
  useImageUpload: () => ({ upload: vi.fn(), uploadForTask: vi.fn() }),
  useTaskMutations: () => ({
    createAndStart: { mutateAsync: createAndStart },
  }),
  useProjectRepos: (projectId?: string) => ({
    data: projectId ? repos : [],
  }),
  useRepoBranchSelection: ({ repos: forRepos }: { repos: typeof repos }) => {
    const ready = React.useSyncExternalStore(
      (cb) => {
        branchListeners.add(cb);
        return () => branchListeners.delete(cb);
      },
      () => branchesReady
    );
    return {
      configs: !ready
        ? []
        : forRepos.map((repo) => ({
            repoId: repo.id,
            repoDisplayName: repo.display_name,
            targetBranch: repo.default_target_branch,
            branches: [{ name: 'main', is_current: true }],
          })),
      isLoading: forRepos.length > 0 && !ready,
      setRepoBranch: vi.fn(),
    };
  },
}));

vi.mock('@/components/tasks/AgentRunControls', () => ({
  AgentRunControls: () => (
    <div>
      <button type="button">Claude Code</button>
      <button type="button">Opus</button>
    </div>
  ),
}));

import { NewTaskDialog } from './NewTaskDialog';

function renderApp() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <NiceModal.Provider>
        <button type="button">open</button>
      </NiceModal.Provider>
    </QueryClientProvider>
  );
}

describe('NewTaskDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    branchesReady = false;
    localStorage.clear();
  });

  it('shows the project and its default branch, with agent and model chips', async () => {
    renderApp();
    NewTaskDialog.show({ mode: 'create', projectId: 'project-1' });

    expect(
      await screen.findByRole('button', { name: 'Project One' })
    ).toBeInTheDocument();
    act(deliverBranches);
    expect(
      await screen.findByRole('button', { name: 'main' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Claude Code' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opus' })).toBeInTheDocument();
  });

  it('starts the task in the preselected project on its default branch', async () => {
    renderApp();
    NewTaskDialog.show({ mode: 'create', projectId: 'project-1' });

    fireEvent.change(await screen.findByLabelText('Task title'), {
      target: { value: 'Fix the thing' },
    });
    act(deliverBranches);
    const start = await screen.findByRole('button', { name: 'Start' });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);

    await waitFor(() => expect(createAndStart).toHaveBeenCalled());
    expect(createAndStart.mock.calls[0][0]).toMatchObject({
      task: { project_id: 'project-1', title: 'Fix the thing' },
      repos: [{ repo_id: 'repo-1', target_branch: 'main' }],
    });
  });
});
