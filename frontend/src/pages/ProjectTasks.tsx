import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { tasksApi } from '@/lib/api';
import type { Workspace } from 'shared/types';
import { openTaskForm } from '@/lib/openTaskForm';
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

// The board is not reachable for now, but its column shape is still what this page builds.
import { type KanbanColumns } from '@/components/tasks/TaskKanbanBoard';
import {
  NoTasksEmptyState,
  NoSearchResultsEmptyState,
} from '@/components/tasks/TasksEmptyState';
import { DeleteTaskConfirmationDialog } from '@/components/dialogs';
import { TaskGroupSidebar } from '@/components/tasks/TaskGroupSidebar';
import { TaskGroupSidebarSkeleton } from '@/components/tasks/TaskGroupSidebarSkeleton';
import type { DragEndEvent } from '@/components/ui/shadcn-io/kanban';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { TasksLayout, type LayoutMode } from '@/components/layout/TasksLayout';
import { AttemptDetailsPanel } from '@/components/panels/AttemptDetailsPanel';
import { DevServerLogsPanel } from '@/components/panels/DevServerLogsPanel';
import { WorkspaceEnvPanel } from '@/components/panels/WorkspaceEnvPanel';
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
} from '@/components/ui/breadcrumb';
import { AttemptHeaderActions } from '@/components/panels/AttemptHeaderActions';
import { TaskPanelHeaderActions } from '@/components/panels/TaskPanelHeaderActions';

import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

type Task = TaskWithAttemptStatus;

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
    isLoading: projectLoading,
    error: projectError,
  } = useProject();

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

  // Lifts the composer only once the transcript has actually scrolled under it.
  const composerRef = useRef<HTMLDivElement>(null);
  const [isTranscriptScrolled, setIsTranscriptScrolled] = useState(false);

  const isPanelOpen = Boolean(taskId && selectedTask);

  // Kablan fork: upstream opened a five-slide feature tour here the first time the task panel was
  // used. Its slides were vibe-kanban screenshots and it streamed videos from the original
  // author's personal CDN (vkcdn.britannio.dev), so every user of this fork would have pulled
  // promotional media from them. Removed rather than rebranded.

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
    : rawMode === 'diffs' || rawMode === 'logs' || rawMode === 'env'
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
      const order: LayoutMode[] = ['details', 'diffs', 'logs', 'env', null];
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
        const order: LayoutMode[] = ['details', 'diffs', 'logs', 'env', null];
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
        const order: LayoutMode[] = ['details', 'diffs', 'logs', 'env', null];
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

  const queryClient = useQueryClient();

  const handleClosePanel = useCallback(() => {
    if (projectId) {
      navigate(`/local-projects/${projectId}/tasks`, { replace: true });
    }
  }, [projectId, navigate]);

  const handleViewTaskDetails = useCallback(
    (task: Task, attemptIdToShow?: string) => {
      if (!projectId) return;

      // Opening the task is reading it. Fire and forget: the stream brings the row back without
      // its unread mark, and a failure here is not worth interrupting navigation for.
      if (task.has_unseen_turns) {
        tasksApi
          .markSeen(task.id)
          .then(() => {
            // The sidebar's dot is drawn from the project stats, which nothing else refreshes here.
            queryClient.invalidateQueries({
              queryKey: ['projects', 'with-stats'],
            });
          })
          .catch(() => {});
      }

      if (attemptIdToShow) {
        navigateWithSearch(paths.attempt(projectId, task.id, attemptIdToShow));
      } else {
        navigateWithSearch(`${paths.task(projectId, task.id)}/attempts/latest`);
      }
    },
    [projectId, navigateWithSearch]
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

  // Row hover actions. Both go through the same paths as their menu equivalents — archiving is
  // a flag on the task, deleting asks first — and the stream brings the list back without a
  // refetch here.
  const handleArchiveTask = useCallback(async (task: TaskWithAttemptStatus) => {
    try {
      await tasksApi.setArchived([task.id], true);
    } catch (err) {
      console.error('Failed to archive task:', err);
    }
  }, []);

  const handleDeleteTask = useCallback(
    (task: TaskWithAttemptStatus) => {
      if (!projectId) return;
      // A dismissed dialog rejects; that is a decision, not a failure.
      DeleteTaskConfirmationDialog.show({ task, projectId }).catch(() => {});
    },
    [projectId]
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
  // One view now: the grouped task list is always the left column, whether or not a task is
  // open. The board and the full-width list each answered "show me everything" by taking the
  // window, so opening a task meant losing the list and going back meant leaving the
  // conversation. Both still exist (TaskKanbanBoard, TaskListView) and neither is reachable.
  const kanbanContent = isInitialTasksLoad ? (
    // Switching projects goes through here: the query key changes, tasks empties, and without
    // this the column would flash the "no tasks" state before the new ones arrive.
    <TaskGroupSidebarSkeleton />
  ) : tasks.length === 0 ? (
    <NoTasksEmptyState onCreate={handleCreateNewTask} />
  ) : !hasVisibleTasks ? (
    <NoSearchResultsEmptyState onClear={hasSearch ? clearSearch : undefined} />
  ) : (
    <TaskGroupSidebar
      columns={visibleTasksByStatus}
      order={TASK_STATUSES}
      selectedTaskId={selectedTask?.id}
      onSelect={handleViewTaskDetails}
      onCreateTask={handleCreateNewTask}
      onDragEnd={handleDragEnd}
      onArchiveTask={handleArchiveTask}
      onDeleteTask={handleDeleteTask}
    />
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
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </NewCardHeader>
  ) : null;

  const attemptContent = selectedTask ? (
    <NewCard className="h-full min-h-0 flex flex-col bg-muted/25 border-0">
      {isTaskView ? (
        <TaskPanel task={selectedTask} />
      ) : (
        <TaskAttemptPanel attempt={attempt} task={selectedTask}>
          {({ logs, followUp }) => (
            <>
              <GitErrorBanner />
              {/* Scroll events do not bubble, but they do capture — so the column can watch the
                  transcript scroll without the virtualised list having to expose anything.
                  Scrolls originating inside the composer itself are ignored. */}
              <div
                className="flex-1 min-h-0 flex flex-col"
                onScrollCapture={(e) => {
                  const target = e.target as HTMLElement;
                  if (composerRef.current?.contains(target)) return;
                  const scrolled = target.scrollTop > 1;
                  setIsTranscriptScrolled((prev) =>
                    prev === scrolled ? prev : scrolled
                  );
                }}
              >
                <div className="relative flex-1 min-h-0 flex flex-col">
                  {logs}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-8 backdrop-blur-[3px] [mask-image:linear-gradient(to_top,black_20%,transparent)]"
                  />
                </div>

                <div className="shrink-0">
                  <div className="mx-auto w-full max-w-[50rem]">
                    <TodoPanel />
                  </div>
                </div>

                <div
                  ref={composerRef}
                  data-scrolled={isTranscriptScrolled}
                  className="group/composer min-h-0 max-h-[50%] overflow-hidden"
                >
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
  ) : (
    // The right side is always there now, so it has to say something when nothing is chosen.
    <div className="flex h-full items-center justify-center px-6 text-center">
      <p className="max-w-xs text-sm text-muted-foreground">
        Pick a task on the left to see its conversation and details.
      </p>
    </div>
  );

  const auxContent =
    selectedTask && attempt ? (
      <div className="relative h-full w-full">
        {mode === 'details' && (
          <AttemptDetailsPanel
            attempt={attempt}
            task={selectedTask}
            onOpenDiffs={() => setMode('diffs')}
            onOpenEnv={() => setMode('env')}
          />
        )}
        {mode === 'logs' && <DevServerLogsPanel attemptId={attempt.id} />}
        {mode === 'env' && <WorkspaceEnvPanel attempt={attempt} />}
        {mode === 'diffs' && <DiffsPanelContainer attempt={attempt} />}
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

      <div className="flex-1 min-h-0">{attemptArea}</div>
    </div>
  );
}
