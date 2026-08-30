import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Cloud,
  Columns3,
  ExternalLink,
  List,
  Sparkles,
} from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { tasksApi } from '@/lib/api';
import type { Workspace } from 'shared/types';
import { openTaskForm } from '@/lib/openTaskForm';
import { BetaWorkspacesDialog } from '@/components/dialogs/global/BetaWorkspacesDialog';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { useWorkspaceCount } from '@/hooks/useWorkspaceCount';
import { usePostHog } from 'posthog-js/react';

import { useSearch } from '@/contexts/SearchContext';
import { useProject } from '@/contexts/ProjectContext';
import { useTaskAttempts } from '@/hooks/useTaskAttempts';
import { useTaskAttemptWithSession } from '@/hooks/useTaskAttempt';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { paths } from '@/lib/paths';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import {
  GitOperationsProvider,
  useGitOperationsError,
} from '@/contexts/GitOperationsContext';
import {
  useKeyCreate,
  useKeyExit,
  useKeyFocusSearch,
  useKeyNavUp,
  useKeyNavDown,
  useKeyNavLeft,
  useKeyNavRight,
  useKeyOpenDetails,
  Scope,
  useKeyDeleteTask,
  useKeyCycleViewBackward,
} from '@/keyboard';

import TaskKanbanBoard, {
  type KanbanColumns,
} from '@/components/tasks/TaskKanbanBoard';
import {
  NoTasksEmptyState,
  NoSearchResultsEmptyState,
} from '@/components/tasks/TasksEmptyState';
import { TaskListView } from '@/components/tasks/TaskListView';
import { TaskSidebarList } from '@/components/tasks/TaskSidebarList';
import type { DragEndEvent } from '@/components/ui/shadcn-io/kanban';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { TasksLayout, type LayoutMode } from '@/components/layout/TasksLayout';
import { AttemptDetailsPanel } from '@/components/panels/AttemptDetailsPanel';
import { DevServerLogsPanel } from '@/components/panels/DevServerLogsPanel';
import { DiffsPanel } from '@/components/panels/DiffsPanel';
import TaskAttemptPanel from '@/components/panels/TaskAttemptPanel';
import TaskPanel from '@/components/panels/TaskPanel';
import TodoPanel from '@/components/tasks/TodoPanel';
import { NewCard, NewCardHeader } from '@/components/ui/new-card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AttemptHeaderActions } from '@/components/panels/AttemptHeaderActions';
import { TaskPanelHeaderActions } from '@/components/panels/TaskPanelHeaderActions';
import { useSelectedOrgId } from '@/stores/useOrganizationStore';

import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

type Task = TaskWithAttemptStatus;

const TASK_VIEW_KEY = 'kablan.tasks.view';

const TASK_STATUSES = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
] as const;

const normalizeStatus = (status: string): TaskStatus =>
  status.toLowerCase() as TaskStatus;

function GitErrorBanner() {
  const { error: gitError } = useGitOperationsError();

  if (!gitError) return null;

  return (
    <div className="mx-4 mt-4 p-3 border border-destructive rounded">
      <div className="text-destructive text-sm">{gitError}</div>
    </div>
  );
}

// The diff view used to carry its own copy of the git toolbar. Merge, rebase and push live in
// the details column now — one toggle away — so the diff shows only the diff.
function DiffsPanelContainer({ attempt }: { attempt: Workspace | null }) {
  return <DiffsPanel key={attempt?.id} selectedAttempt={attempt} />;
}

export function ProjectTasks() {
  const { t } = useTranslation(['tasks', 'common']);
  const { taskId, attemptId } = useParams<{
    projectId: string;
    taskId?: string;
    attemptId?: string;
  }>();
  const navigate = useNavigate();
  const { enableScope, disableScope, activeScopes } = useHotkeysContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const isXL = useMediaQuery('(min-width: 1280px)');
  const isMobile = !isXL;
  const posthog = usePostHog();

  const {
    projectId,
    project,
    isLoading: projectLoading,
    error: projectError,
  } = useProject();
  const selectedOrgId = useSelectedOrgId();

  useEffect(() => {
    enableScope(Scope.KANBAN);

    return () => {
      disableScope(Scope.KANBAN);
    };
  }, [enableScope, disableScope]);

  const handleCreateTask = useCallback(() => {
    if (projectId) {
      openTaskForm({ mode: 'create', projectId });
    }
  }, [projectId]);
  const { query: searchQuery, focusInput, clear: clearSearch } = useSearch();

  const {
    tasks,
    tasksById,
    isLoading,
    error: streamError,
  } = useProjectTasks(projectId || '');

  const selectedTask = useMemo(
    () => (taskId ? (tasksById[taskId] ?? null) : null),
    [taskId, tasksById]
  );

  const isPanelOpen = Boolean(taskId && selectedTask);

  const { config, updateAndSaveConfig, loading } = useUserSystem();

  const isLoaded = !loading;

  // Kablan fork: upstream opened a five-slide feature tour here the first time the task panel was
  // used. Its slides were vibe-kanban screenshots and it streamed videos from the original
  // author's personal CDN (vkcdn.britannio.dev), so every user of this fork would have pulled
  // promotional media from them. Removed rather than rebranded.

  // Beta workspaces invitation - only fetch count if invitation not yet sent
  const shouldCheckBetaInvitation =
    isLoaded && !config?.beta_workspaces_invitation_sent;
  const { data: workspaceCount } = useWorkspaceCount({
    enabled: shouldCheckBetaInvitation,
  });

  useEffect(() => {
    if (!isLoaded) return;
    if (config?.beta_workspaces_invitation_sent) return;
    if (workspaceCount === undefined || workspaceCount <= 5) return;

    BetaWorkspacesDialog.show().then((joinBeta) => {
      BetaWorkspacesDialog.hide();
      void updateAndSaveConfig({
        beta_workspaces_invitation_sent: true,
        beta_workspaces: joinBeta === true,
      });
      if (joinBeta === true) {
        navigate('/workspaces');
      }
    });
  }, [
    isLoaded,
    config?.beta_workspaces_invitation_sent,
    workspaceCount,
    updateAndSaveConfig,
    navigate,
  ]);

  // Redirect beta users from old attempt URLs to the new workspaces UI
  useEffect(() => {
    if (!isLoaded) return;
    if (!config?.beta_workspaces) return;
    if (!attemptId || attemptId === 'latest') return;

    navigate(`/workspaces/${attemptId}`, { replace: true });
  }, [isLoaded, config?.beta_workspaces, attemptId, navigate]);

  const isLatest = attemptId === 'latest';
  const { data: attempts = [], isLoading: isAttemptsLoading } = useTaskAttempts(
    taskId,
    {
      enabled: !!taskId && isLatest,
    }
  );

  const latestAttemptId = useMemo(() => {
    if (!attempts?.length) return undefined;
    return [...attempts].sort((a, b) => {
      const diff =
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    })[0].id;
  }, [attempts]);

  const navigateWithSearch = useCallback(
    (pathname: string, options?: { replace?: boolean }) => {
      const search = searchParams.toString();
      navigate({ pathname, search: search ? `?${search}` : '' }, options);
    },
    [navigate, searchParams]
  );

  useEffect(() => {
    if (!projectId || !taskId) return;
    if (!isLatest) return;
    if (isAttemptsLoading) return;

    if (!latestAttemptId) {
      navigateWithSearch(paths.task(projectId, taskId), { replace: true });
      return;
    }

    navigateWithSearch(paths.attempt(projectId, taskId, latestAttemptId), {
      replace: true,
    });
  }, [
    projectId,
    taskId,
    isLatest,
    isAttemptsLoading,
    latestAttemptId,
    navigate,
    navigateWithSearch,
  ]);

  useEffect(() => {
    if (!projectId || !taskId || isLoading) return;
    if (selectedTask === null) {
      navigate(`/local-projects/${projectId}/tasks`, { replace: true });
    }
  }, [projectId, taskId, isLoading, selectedTask, navigate]);

  const effectiveAttemptId = attemptId === 'latest' ? undefined : attemptId;
  const isTaskView = !!taskId && !effectiveAttemptId;
  const { data: attempt } = useTaskAttemptWithSession(effectiveAttemptId);

  const rawMode = searchParams.get('view');
  // The details column is the default company for an open attempt — you almost always want the
  // attempt's branch, dev server and git state in sight while the agent works. `view=chat` is
  // how "I closed the column" is spelled, since the absent param now means the default.
  const mode: LayoutMode = !effectiveAttemptId
    ? null
    : rawMode === 'diffs' || rawMode === 'logs'
      ? rawMode
      : rawMode === 'chat'
        ? null
        : 'details';

  // Legacy URL support for bookmarked links: `view=preview` named a pane this fork folded into
  // the details column. `view=logs` used to be redirected to the diff, but it now names the dev
  // server's own pane — which is closer to what anyone following such a link meant anyway.
  useEffect(() => {
    if (searchParams.get('view') === 'preview') {
      const params = new URLSearchParams(searchParams);
      params.delete('view');
      setSearchParams(params, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const setMode = useCallback(
    (newMode: LayoutMode) => {
      const params = new URLSearchParams(searchParams);
      if (newMode === null) {
        params.set('view', 'chat');
      } else if (newMode === 'details') {
        params.delete('view');
      } else {
        params.set('view', newMode);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const handleCreateNewTask = useCallback(() => {
    handleCreateTask();
  }, [handleCreateTask]);

  useKeyCreate(handleCreateNewTask, {
    scope: Scope.KANBAN,
    preventDefault: true,
  });

  useKeyFocusSearch(
    () => {
      focusInput();
    },
    {
      scope: Scope.KANBAN,
      preventDefault: true,
    }
  );

  useKeyExit(
    () => {
      if (isPanelOpen) {
        handleClosePanel();
      } else {
        navigate('/local-projects');
      }
    },
    { scope: Scope.KANBAN }
  );

  // Board vs list, remembered across visits.
  const [taskView, setTaskView] = useState<'board' | 'list'>(() => {
    try {
      return localStorage.getItem(TASK_VIEW_KEY) === 'list' ? 'list' : 'board';
    } catch {
      return 'board';
    }
  });
  const changeTaskView = (next: 'board' | 'list') => {
    setTaskView(next);
    try {
      localStorage.setItem(TASK_VIEW_KEY, next);
    } catch {
      // Blocked storage: the choice just won't persist.
    }
  };

  const hasSearch = Boolean(searchQuery.trim());
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const kanbanColumns = useMemo(() => {
    const columns: KanbanColumns = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    const matchesSearch = (
      title: string,
      description?: string | null
    ): boolean => {
      if (!hasSearch) return true;
      const lowerTitle = title.toLowerCase();
      const lowerDescription = description?.toLowerCase() ?? '';
      return (
        lowerTitle.includes(normalizedSearch) ||
        lowerDescription.includes(normalizedSearch)
      );
    };

    tasks.forEach((task) => {
      const statusKey = normalizeStatus(task.status);

      if (!matchesSearch(task.title, task.description)) {
        return;
      }

      columns[statusKey].push(task);
    });

    TASK_STATUSES.forEach((status) => {
      columns[status].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    return columns;
  }, [hasSearch, normalizedSearch, tasks]);

  const visibleTasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    TASK_STATUSES.forEach((status) => {
      map[status] = kanbanColumns[status];
    });

    return map;
  }, [kanbanColumns]);

  const hasVisibleTasks = useMemo(
    () =>
      Object.values(visibleTasksByStatus).some(
        (items) => items && items.length > 0
      ),
    [visibleTasksByStatus]
  );

  useKeyNavUp(
    () => {
      selectPreviousTask();
    },
    {
      scope: Scope.KANBAN,
      preventDefault: true,
    }
  );

  useKeyNavDown(
    () => {
      selectNextTask();
    },
    {
      scope: Scope.KANBAN,
      preventDefault: true,
    }
  );

  useKeyNavLeft(
    () => {
      selectPreviousColumn();
    },
    {
      scope: Scope.KANBAN,
      preventDefault: true,
    }
  );

  useKeyNavRight(
    () => {
      selectNextColumn();
    },
    {
      scope: Scope.KANBAN,
      preventDefault: true,
    }
  );

  /**
   * Cycle the attempt area view.
   * - When panel is closed: opens task details (if a task is selected)
   * - When panel is open: cycles among [details, diffs, chat only]
   */
  const cycleView = useCallback(
    (direction: 'forward' | 'backward' = 'forward') => {
      const order: LayoutMode[] = ['details', 'diffs', 'logs', null];
      const idx = order.indexOf(mode);
      const next =
        direction === 'forward'
          ? order[(idx + 1) % order.length]
          : order[(idx - 1 + order.length) % order.length];
      setMode(next);
    },
    [mode, setMode]
  );

  const cycleViewForward = useCallback(() => cycleView('forward'), [cycleView]);
  const cycleViewBackward = useCallback(
    () => cycleView('backward'),
    [cycleView]
  );

  // meta/ctrl+enter → open details or cycle forward
  const isFollowUpReadyActive = activeScopes.includes(Scope.FOLLOW_UP_READY);

  useKeyOpenDetails(
    () => {
      if (isPanelOpen) {
        // Track keyboard shortcut before cycling view
        const order: LayoutMode[] = ['details', 'diffs', 'logs', null];
        const idx = order.indexOf(mode);
        const next = order[(idx + 1) % order.length];

        if (next === 'diffs') {
          posthog?.capture('diffs_navigated', {
            trigger: 'keyboard',
            direction: 'forward',
            timestamp: new Date().toISOString(),
            source: 'frontend',
          });
        }

        cycleViewForward();
      } else if (selectedTask) {
        handleViewTaskDetails(selectedTask);
      }
    },
    { scope: Scope.KANBAN, when: () => !isFollowUpReadyActive }
  );

  // meta/ctrl+shift+enter → cycle backward
  useKeyCycleViewBackward(
    () => {
      if (isPanelOpen) {
        // Track keyboard shortcut before cycling view
        const order: LayoutMode[] = ['details', 'diffs', 'logs', null];
        const idx = order.indexOf(mode);
        const next = order[(idx - 1 + order.length) % order.length];

        if (next === 'diffs') {
          posthog?.capture('diffs_navigated', {
            trigger: 'keyboard',
            direction: 'backward',
            timestamp: new Date().toISOString(),
            source: 'frontend',
          });
        }

        cycleViewBackward();
      }
    },
    { scope: Scope.KANBAN, preventDefault: true }
  );

  useKeyDeleteTask(
    () => {
      // Note: Delete is now handled by TaskActionsDropdown
      // This keyboard shortcut could trigger the dropdown action if needed
    },
    {
      scope: Scope.KANBAN,
      preventDefault: true,
    }
  );

  const handleClosePanel = useCallback(() => {
    if (projectId) {
      navigate(`/local-projects/${projectId}/tasks`, { replace: true });
    }
  }, [projectId, navigate]);

  const handleViewTaskDetails = useCallback(
    (task: Task, attemptIdToShow?: string) => {
      if (!projectId) return;

      // If beta_workspaces is enabled, always navigate to task view (not attempt)
      if (config?.beta_workspaces) {
        navigateWithSearch(paths.task(projectId, task.id));
        return;
      }

      if (attemptIdToShow) {
        navigateWithSearch(paths.attempt(projectId, task.id, attemptIdToShow));
      } else {
        navigateWithSearch(`${paths.task(projectId, task.id)}/attempts/latest`);
      }
    },
    [projectId, navigateWithSearch, config?.beta_workspaces]
  );

  const selectNextTask = useCallback(() => {
    if (selectedTask) {
      const statusKey = normalizeStatus(selectedTask.status);
      const tasksInStatus = visibleTasksByStatus[statusKey] || [];
      const currentIndex = tasksInStatus.findIndex(
        (task) => task.id === selectedTask.id
      );
      if (currentIndex >= 0 && currentIndex < tasksInStatus.length - 1) {
        handleViewTaskDetails(tasksInStatus[currentIndex + 1]);
      }
    } else {
      for (const status of TASK_STATUSES) {
        const tasks = visibleTasksByStatus[status];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          break;
        }
      }
    }
  }, [selectedTask, visibleTasksByStatus, handleViewTaskDetails]);

  const selectPreviousTask = useCallback(() => {
    if (selectedTask) {
      const statusKey = normalizeStatus(selectedTask.status);
      const tasksInStatus = visibleTasksByStatus[statusKey] || [];
      const currentIndex = tasksInStatus.findIndex(
        (task) => task.id === selectedTask.id
      );
      if (currentIndex > 0) {
        handleViewTaskDetails(tasksInStatus[currentIndex - 1]);
      }
    } else {
      for (const status of TASK_STATUSES) {
        const tasks = visibleTasksByStatus[status];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          break;
        }
      }
    }
  }, [selectedTask, visibleTasksByStatus, handleViewTaskDetails]);

  const selectNextColumn = useCallback(() => {
    if (selectedTask) {
      const currentStatus = normalizeStatus(selectedTask.status);
      const currentIndex = TASK_STATUSES.findIndex(
        (status) => status === currentStatus
      );
      for (let i = currentIndex + 1; i < TASK_STATUSES.length; i++) {
        const tasks = visibleTasksByStatus[TASK_STATUSES[i]];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          return;
        }
      }
    } else {
      for (const status of TASK_STATUSES) {
        const tasks = visibleTasksByStatus[status];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          break;
        }
      }
    }
  }, [selectedTask, visibleTasksByStatus, handleViewTaskDetails]);

  const selectPreviousColumn = useCallback(() => {
    if (selectedTask) {
      const currentStatus = normalizeStatus(selectedTask.status);
      const currentIndex = TASK_STATUSES.findIndex(
        (status) => status === currentStatus
      );
      for (let i = currentIndex - 1; i >= 0; i--) {
        const tasks = visibleTasksByStatus[TASK_STATUSES[i]];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          return;
        }
      }
    } else {
      for (const status of TASK_STATUSES) {
        const tasks = visibleTasksByStatus[status];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          break;
        }
      }
    }
  }, [selectedTask, visibleTasksByStatus, handleViewTaskDetails]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || !active.data.current) return;

      const draggedTaskId = active.id as string;
      const newStatus = over.id as Task['status'];
      const task = tasksById[draggedTaskId];
      if (!task || task.status === newStatus) return;

      try {
        await tasksApi.update(draggedTaskId, {
          title: task.title,
          description: task.description,
          status: newStatus,
          parent_workspace_id: task.parent_workspace_id,
          image_ids: null,
        });
      } catch (err) {
        console.error('Failed to update task status:', err);
      }
    },
    [tasksById]
  );

  const isInitialTasksLoad = isLoading && tasks.length === 0;

  if (projectError) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            {t('common:states.error')}
          </AlertTitle>
          <AlertDescription>
            {projectError.message || 'Failed to load project'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (projectLoading && isInitialTasksLoad) {
    return <Loader message={t('loading')} size={32} className="py-8" />;
  }

  const truncateTitle = (title: string | undefined, maxLength = 20) => {
    if (!title) return 'Task';
    if (title.length <= maxLength) return title;

    const truncated = title.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    return lastSpace > 0
      ? `${truncated.substring(0, lastSpace)}...`
      : `${truncated}...`;
  };

  // With a task open the left pane becomes the task list: the board's columns are unreadable at
  // sidebar width, and losing sight of the other tasks was the point of the redesign. The centre
  // (the agent conversation) is untouched.
  const kanbanContent = isPanelOpen ? (
    <TaskSidebarList
      tasksByStatus={visibleTasksByStatus}
      order={TASK_STATUSES}
      selectedTaskId={selectedTask?.id}
      onSelect={handleViewTaskDetails}
    />
  ) : tasks.length === 0 ? (
      <NoTasksEmptyState onCreate={handleCreateNewTask} />
    ) : !hasVisibleTasks ? (
      <NoSearchResultsEmptyState onClear={hasSearch ? clearSearch : undefined} />
    ) : (
      <div className="flex h-full w-full flex-col overflow-hidden">
        {/* Board vs list. Sits with the content rather than in the page chrome, because the
            chrome is shared with the task-detail view where the choice is meaningless. */}
        <div className="flex shrink-0 justify-end px-6 pt-3">
          <div className="flex items-center border border-border p-0.5">
            <Button
              variant={taskView === 'board' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => changeTaskView('board')}
              aria-label="Board view"
              aria-pressed={taskView === 'board'}
              title="Board view"
            >
              <Columns3 className="h-4 w-4" />
            </Button>
            <Button
              variant={taskView === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => changeTaskView('list')}
              aria-label="List view"
              aria-pressed={taskView === 'list'}
              title="List view"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-x-contain">
        {taskView === 'list' ? (
          <TaskListView
            columns={kanbanColumns}
            order={TASK_STATUSES}
            selectedTaskId={selectedTask?.id}
            onViewTaskDetails={handleViewTaskDetails}
          />
        ) : (
          <TaskKanbanBoard
            columns={kanbanColumns}
            onDragEnd={handleDragEnd}
            onViewTaskDetails={handleViewTaskDetails}
            selectedTaskId={selectedTask?.id}
            onCreateTask={handleCreateNewTask}
            projectId={projectId!}
          />
        )}
        </div>
      </div>
    );

  const rightHeader = selectedTask ? (
    <NewCardHeader
      className="shrink-0"
      actions={
        isTaskView ? (
          <TaskPanelHeaderActions
            task={selectedTask}
            onClose={() =>
              navigate(`/local-projects/${projectId}/tasks`, { replace: true })
            }
          />
        ) : (
          <AttemptHeaderActions
            mode={mode}
            onModeChange={setMode}
            task={selectedTask}
            attempt={attempt ?? null}
            onClose={() =>
              navigate(`/local-projects/${projectId}/tasks`, { replace: true })
            }
          />
        )
      }
    >
      <div className="mx-auto w-full">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {isTaskView ? (
                <BreadcrumbPage>
                  {truncateTitle(selectedTask?.title)}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  className="cursor-pointer hover:underline"
                  onClick={() =>
                    navigateWithSearch(paths.task(projectId!, taskId!))
                  }
                >
                  {truncateTitle(selectedTask?.title)}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {!isTaskView && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {attempt?.branch || 'Task Attempt'}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </NewCardHeader>
  ) : null;

  const attemptContent = selectedTask ? (
    <NewCard className="h-full min-h-0 flex flex-col bg-muted border-0">
      {isTaskView ? (
        <TaskPanel task={selectedTask} />
      ) : (
        <TaskAttemptPanel attempt={attempt} task={selectedTask}>
          {({ logs, followUp }) => (
            <>
              <GitErrorBanner />
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 flex flex-col">{logs}</div>

                <div className="shrink-0 border-t">
                  <div className="mx-auto w-full max-w-[50rem]">
                    <TodoPanel />
                  </div>
                </div>

                <div className="min-h-0 max-h-[50%] border-t overflow-hidden bg-background">
                  <div className="mx-auto w-full max-w-[50rem] h-full min-h-0">
                    {followUp}
                  </div>
                </div>
              </div>
            </>
          )}
        </TaskAttemptPanel>
      )}
    </NewCard>
  ) : null;

  const auxContent =
    selectedTask && attempt ? (
      <div className="relative h-full w-full">
        {mode === 'details' && (
          <AttemptDetailsPanel
            attempt={attempt}
            task={selectedTask}
            onOpenDiffs={() => setMode('diffs')}
            onOpenLogs={() => setMode('logs')}
          />
        )}
        {mode === 'logs' && <DevServerLogsPanel attemptId={attempt.id} />}
        {mode === 'diffs' && (
          <DiffsPanelContainer attempt={attempt} />
        )}
      </div>
    ) : (
      <div className="relative h-full w-full" />
    );

  const attemptArea = (
    <GitOperationsProvider attemptId={attempt?.id}>
      <ClickedElementsProvider attempt={attempt}>
        <ReviewProvider attemptId={attempt?.id}>
          <ExecutionProcessesProvider
            attemptId={attempt?.id}
            sessionId={attempt?.session?.id}
          >
            <TasksLayout
              kanban={kanbanContent}
              attempt={attemptContent}
              aux={auxContent}
              isPanelOpen={isPanelOpen}
              mode={mode}
              isMobile={isMobile}
              rightHeader={rightHeader}
            />
          </ExecutionProcessesProvider>
        </ReviewProvider>
      </ClickedElementsProvider>
    </GitOperationsProvider>
  );

  return (
    <div className="h-full flex flex-col">
      {streamError && (
        <Alert className="w-full z-30 xl:sticky xl:top-0">
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            {t('common:states.reconnecting')}
          </AlertTitle>
          <AlertDescription>{streamError}</AlertDescription>
        </Alert>
      )}

      {config?.beta_workspaces && (
        <div className="mx-4 my-4 flex justify-center">
          <div className="max-w-2xl w-full p-3 border border-orange-500/30 bg-orange-500/5 rounded flex items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              {project?.remote_project_id ? (
                <Cloud className="h-5 w-5 text-orange-500" />
              ) : (
                <Sparkles className="h-5 w-5 text-orange-500" />
              )}
              <div>
                {project?.remote_project_id ? (
                  <>
                    <p className="text-sm font-medium">
                      Project migrated to Cloud
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Access collaboration, tags, priorities, and more
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      Migrate this project to the cloud
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Get collaboration, tags, priorities, sub-issues and more
                    </p>
                  </>
                )}
              </div>
            </div>
            {project?.remote_project_id ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(
                    `/projects/${project.remote_project_id}${selectedOrgId ? `?orgId=${selectedOrgId}` : ''}`
                  )
                }
                className="flex items-center gap-1.5"
              >
                View project
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/migrate')}
              >
                Learn more
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0">{attemptArea}</div>
    </div>
  );
}
