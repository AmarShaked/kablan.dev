import * as React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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
  // The readiness row under the agent picker renders its detail line through `Trans` so the
  // sign-in command can be marked up as a literal. Key is enough to assert against here.
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

// Readiness drives the submit button's label, so it has to be pinned here — otherwise these
// tests go through the real hook, the fetch fails, and every button reads "Start anyway".
const agentAvailability = vi.hoisted(() => ({
  current: { status: 'login_detected' } as { status: string },
}));

vi.mock('@/hooks/useAgentAvailability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useAgentAvailability')>()),
  useAgentAvailability: () => ({
    availability: agentAvailability.current,
    recheck: vi.fn(),
  }),
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
const upload = vi.hoisted(() => vi.fn());

vi.mock('@/hooks', () => ({
  useImageUpload: () => ({ upload, uploadForTask: vi.fn() }),
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
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
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
    const start = await screen.findByRole('button', {
      name: 'taskFormDialog.start',
    });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);

    await waitFor(() => expect(createAndStart).toHaveBeenCalled());
    expect(createAndStart.mock.calls[0][0]).toMatchObject({
      task: { project_id: 'project-1', title: 'Fix the thing' },
      repos: [{ repo_id: 'repo-1', target_branch: 'main' }],
    });
  });

  // Shaked's call, 26 Oct 2026: warn, never block. Readiness is one `stat` on a credentials
  // file and nothing checks the binary, so a hard block would turn any false negative into a
  // user who cannot use Kablan at all — with no remedy inside the product.
  describe('when the agent is not ready', () => {
    afterEach(() => {
      agentAvailability.current = { status: 'login_detected' };
    });

    it.each([['not_found'], ['error']])(
      'relabels Start to Start anyway on %s, and leaves it clickable',
      async (status) => {
        agentAvailability.current = { status };
        renderApp();
        NewTaskDialog.show({ mode: 'create', projectId: 'project-1' });

        fireEvent.change(await screen.findByLabelText('Task title'), {
          target: { value: 'Fix the thing' },
        });
        act(deliverBranches);

        const start = await screen.findByRole('button', {
          name: 'taskFormDialog.startAnyway',
        });
        await waitFor(() => expect(start).toBeEnabled());

        expect(
          screen.queryByRole('button', { name: 'taskFormDialog.start' })
        ).toBeNull();

        fireEvent.click(start);
        await waitFor(() => expect(createAndStart).toHaveBeenCalled());
      }
    );

    it('still says Start while the check is in flight', async () => {
      agentAvailability.current = { status: 'checking' };
      renderApp();
      NewTaskDialog.show({ mode: 'create', projectId: 'project-1' });

      fireEvent.change(await screen.findByLabelText('Task title'), {
        target: { value: 'Fix the thing' },
      });
      act(deliverBranches);

      expect(
        await screen.findByRole('button', { name: 'taskFormDialog.start' })
      ).toBeTruthy();
    });
  });

  it('uploads an image pasted into the description', async () => {
    upload.mockResolvedValue({
      id: 'img-1',
      original_name: 'shot.png',
      file_path: 'uploads/shot.png',
    });
    renderApp();
    NewTaskDialog.show({ mode: 'create', projectId: 'project-1' });

    const description = await screen.findByLabelText('description');
    const file = new File(['png'], 'shot.png', { type: 'image/png' });
    fireEvent.paste(description, {
      clipboardData: {
        files: [file],
        items: [],
      },
    });

    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'shot.png' })).toHaveAttribute(
        'src',
        '/api/images/img-1/file'
      )
    );
    expect(description).toHaveValue('');

    act(deliverBranches);
    fireEvent.change(await screen.findByLabelText('Task title'), {
      target: { value: 'Fix the thing' },
    });
    const start = await screen.findByRole('button', {
      name: 'taskFormDialog.start',
    });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);

    await waitFor(() => expect(createAndStart).toHaveBeenCalled());
    expect(createAndStart.mock.calls[0][0].task).toMatchObject({
      description: '![shot.png](uploads/shot.png)',
      image_ids: ['img-1'],
    });
    expect(upload).toHaveBeenCalledWith(file);
  });
});
