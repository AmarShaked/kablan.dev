import * as React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import NiceModal from '@ebay/nice-modal-react';

/**
 * The sidebar's "create task" opens this form without a project, so the project — and with it the
 * repos and their branches — only arrives mid-edit. These cover that path: what the user typed has
 * to survive the project arriving, the Create button has to end up usable, and closing the form
 * has to leave the app in a state where it can be opened again.
 */

const repos = [
  { id: 'repo-1', display_name: 'repo one', default_target_branch: 'main' },
];

// Branches are fetched only once a project (and so a repo) is known, so they arrive a beat after
// the project is picked. This little store lets a test decide when that happens.
let branchesReady = false;
const branchListeners = new Set<() => void>();
const subscribeBranches = (cb: () => void) => {
  branchListeners.add(cb);
  return () => {
    branchListeners.delete(cb);
  };
};
const deliverBranches = () => {
  branchesReady = true;
  branchListeners.forEach((cb) => cb());
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/contexts/UserSystemContext', () => ({
  useUserSystem: () => ({
    system: { config: { executor_profile: { executor: 'CLAUDE_CODE' } } },
    profiles: { CLAUDE_CODE: {} },
    loading: false,
  }),
}));

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({
    projects: [
      { id: 'project-1', name: 'Project One' },
      { id: 'project-2', name: 'Project Two' },
    ],
  }),
}));

const createTask = vi.fn().mockResolvedValue(undefined);
const createAndStart = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks', () => ({
  useTaskImages: () => ({ data: undefined }),
  useImageUpload: () => ({ upload: vi.fn(), uploadForTask: vi.fn() }),
  useTaskMutations: () => ({
    createTask: { mutateAsync: createTask },
    createAndStart: { mutateAsync: createAndStart },
    updateTask: { mutateAsync: vi.fn() },
  }),
  useProjectRepos: (projectId: string) => ({ data: projectId ? repos : [] }),
  useRepoBranchSelection: ({ repos: forRepos }: { repos: typeof repos }) => {
    const ready = React.useSyncExternalStore(
      subscribeBranches,
      () => branchesReady
    );
    const isLoading = forRepos.length > 0 && !ready;
    return {
      configs: isLoading
        ? []
        : forRepos.map((repo) => ({
            repoId: repo.id,
            repoDisplayName: repo.display_name,
            targetBranch: repo.default_target_branch,
            branches: [{ name: 'main', is_current: true }],
          })),
      isLoading,
    };
  },
}));

vi.mock('@/keyboard', () => ({
  useKeySubmitTask: () => {},
  useKeySubmitTaskAlt: () => {},
  useKeyExit: () => {},
  Scope: { DIALOG: 'DIALOG', CONFIRMATION: 'CONFIRMATION' },
}));

vi.mock('react-hotkeys-hook', () => ({
  useHotkeysContext: () => ({ enableScope: vi.fn(), disableScope: vi.fn() }),
}));

vi.mock('@/components/ui/wysiwyg', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      aria-label="description"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('@/components/settings', () => ({
  ExecutorProfileSelector: () => <div data-testid="executor-profile" />,
}));

vi.mock('@/components/tasks/BranchSelector', () => ({
  default: ({ selectedBranch }: { selectedBranch: string | null }) => (
    <div data-testid="branch-selector">{selectedBranch ?? 'none'}</div>
  ),
}));

vi.mock('@/components/tasks/RepoBranchSelector', () => ({
  default: () => <div data-testid="repo-branch-selector" />,
}));

// Radix's Select needs pointer APIs jsdom doesn't have; a native select exercises the same
// value/onValueChange contract the dialog depends on.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      aria-label="project"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="">Choose a project</option>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

import { TaskFormDialog } from './TaskFormDialog';

function renderApp() {
  return render(
    <NiceModal.Provider>
      <button type="button">sidebar new task</button>
    </NiceModal.Provider>
  );
}

const titleInput = () =>
  screen.findByPlaceholderText('taskFormDialog.titlePlaceholder');
const createButton = () =>
  screen.getByRole('button', { name: 'taskFormDialog.create' });
const pickProject = () =>
  fireEvent.change(screen.getByLabelText('project'), {
    target: { value: 'project-1' },
  });

describe('TaskFormDialog opened from the sidebar (no project yet)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    branchesReady = false;
  });

  it('enables Create when the project is chosen after the title is typed', async () => {
    renderApp();
    TaskFormDialog.show({ mode: 'create' });

    fireEvent.change(await titleInput(), {
      target: { value: 'Fix the thing' },
    });
    pickProject();
    act(deliverBranches);

    await waitFor(() => expect(createButton()).toBeEnabled());
  });

  it('enables Create when the project is chosen before the title is typed', async () => {
    renderApp();
    TaskFormDialog.show({ mode: 'create' });

    await titleInput();
    pickProject();
    act(deliverBranches);
    fireEvent.change(await titleInput(), {
      target: { value: 'Fix the thing' },
    });

    await waitFor(() => expect(createButton()).toBeEnabled());
  });

  it('stays on screen while the chosen project loads its branches', async () => {
    // Unmounting the dialog to wait leaves Radix's `pointer-events: none` on <body>, and the app
    // stops taking clicks for good once the dialog is closed.
    renderApp();
    TaskFormDialog.show({ mode: 'create' });

    await titleInput();
    pickProject();

    expect(
      screen.getByPlaceholderText('taskFormDialog.titlePlaceholder')
    ).toBeInTheDocument();
    act(deliverBranches);
    expect(
      screen.getByPlaceholderText('taskFormDialog.titlePlaceholder')
    ).toBeInTheDocument();
  });

  it('keeps the typed title and description when the project arrives', async () => {
    renderApp();
    TaskFormDialog.show({ mode: 'create' });

    fireEvent.change(await titleInput(), {
      target: { value: 'Fix the thing' },
    });
    fireEvent.change(screen.getByLabelText('description'), {
      target: { value: 'Details here' },
    });
    pickProject();
    act(deliverBranches);

    expect(await titleInput()).toHaveValue('Fix the thing');
    expect(screen.getByLabelText('description')).toHaveValue('Details here');
  });

  it('starts the task with the chosen project and its branch', async () => {
    renderApp();
    TaskFormDialog.show({ mode: 'create' });

    fireEvent.change(await titleInput(), {
      target: { value: 'Fix the thing' },
    });
    pickProject();
    act(deliverBranches);
    await waitFor(() => expect(createButton()).toBeEnabled());
    fireEvent.click(createButton());

    await waitFor(() => expect(createAndStart).toHaveBeenCalled());
    expect(createAndStart.mock.calls[0][0]).toMatchObject({
      task: { project_id: 'project-1', title: 'Fix the thing' },
      repos: [{ repo_id: 'repo-1', target_branch: 'main' }],
    });
  });

  it('opens again after being closed with unsaved changes discarded', async () => {
    renderApp();
    TaskFormDialog.show({ mode: 'create' });

    fireEvent.change(await titleInput(), {
      target: { value: 'Fix the thing' },
    });
    pickProject();
    act(deliverBranches);

    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'taskFormDialog.discardDialog.discardChanges',
      })
    );
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText('taskFormDialog.titlePlaceholder')
      ).not.toBeInTheDocument()
    );
    // A dialog that unmounted without Radix seeing it close can leave the page inert.
    expect(document.body.style.pointerEvents).not.toBe('none');

    TaskFormDialog.show({ mode: 'create' });
    expect(await titleInput()).toBeInTheDocument();
  });
});
