import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { WarzoneFocus } from '@/components/warzone/WarzoneFocus';
import { WarzoneGrid } from '@/components/warzone/WarzoneGrid';
import { useAllTasks, type TaskAcrossProjects } from '@/hooks/useAllTasks';
import { isWarzoneEligible, sortWarzoneTasks } from '@/lib/warzone/eligibility';
import {
  isWarzoneMockTaskId,
  WARZONE_MOCK_TASKS,
} from '@/lib/warzone/mockTasks';
import {
  assignStableSlots,
  parseWarzoneLayout,
  shouldClearReserved,
  warzoneLayout,
} from '@/lib/warzone/slots';
import {
  applyWarzoneTaskParam,
  resolveWarzoneFocusTaskId,
  shouldDropReservedForProjectFilter,
} from '@/lib/warzone/toolbarStatus';
import { TaskFormDialog } from '@/components/dialogs/tasks/TaskFormDialog';
import { openTaskForm } from '@/lib/openTaskForm';
import { paths } from '@/lib/paths';
import { taskNeedsAttention } from '@/utils/taskActivity';

const SLOT_KEY_MAP: Record<string, number> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '0': 10,
};

export function Warzone() {
  const { t } = useTranslation('warzone');
  const navigate = useNavigate();
  const { tasks: liveTasks, isLoading: liveLoading } = useAllTasks('active');

  const [params, setParams] = useSearchParams();
  const mockMode = params.get('mock') === '1';
  const projectFilter = params.get('project');
  const focusedTaskId = params.get('task');
  const layoutId = parseWarzoneLayout(params.get('layout'));
  const slotCount = warzoneLayout(layoutId).slotCount;
  const [createSlot, setCreateSlot] = useState<number | null>(null);
  const [reserved, setReserved] = useState<{
    slot: number;
    taskId: string;
  } | null>(null);
  /** Esc cleared focus — skip auto-focus until user picks a task again. */
  const userClearedFocusRef = useRef(false);
  const pendingCreateSlotRef = useRef<number | null>(null);

  const tasks = mockMode ? WARZONE_MOCK_TASKS : liveTasks;
  const isLoading = mockMode ? false : liveLoading;

  const eligible = useMemo(() => {
    const filtered = projectFilter
      ? tasks.filter((t) => t.projectId === projectFilter)
      : tasks;
    return sortWarzoneTasks(filtered.filter(isWarzoneEligible));
  }, [tasks, projectFilter]);

  const eligibleIds = useMemo(() => eligible.map((t) => t.id), [eligible]);
  const eligibleIdsKey = eligibleIds.join(',');

  useEffect(() => {
    if (shouldClearReserved(reserved, eligibleIds)) {
      setReserved(null);
    }
  }, [eligibleIds, reserved]);

  useEffect(() => {
    if (!reserved) return;
    if (reserved.slot > slotCount) {
      setReserved(null);
      return;
    }
    const reservedTask = tasks.find((t) => t.id === reserved.taskId);
    if (
      shouldDropReservedForProjectFilter({
        reserved,
        projectFilter,
        taskProjectId: reservedTask?.projectId,
      })
    ) {
      setReserved(null);
    }
  }, [projectFilter, reserved, tasks, slotCount]);

  useEffect(() => {
    if (createSlot != null && createSlot > slotCount) {
      TaskFormDialog.hide();
      pendingCreateSlotRef.current = null;
      setCreateSlot(null);
    }
  }, [createSlot, slotCount]);

  const previousAssignment = useRef(new Map<number, string>());
  const { assignment } = useMemo(() => {
    const result = assignStableSlots({
      eligibleIds,
      previous: previousAssignment.current,
      reserved,
      slotCount,
    });
    previousAssignment.current = result.assignment;
    return result;
  }, [eligibleIds, reserved, slotCount]);

  const tasksById = useMemo(
    () => new Map(eligible.map((t) => [t.id, t])),
    [eligible]
  );

  // Keep focus on an eligible task; replace when closed or filtered out of the tab.
  useEffect(() => {
    if (userClearedFocusRef.current) return;
    if (createSlot != null) return;

    const needsYouIds = eligible
      .filter((t) => taskNeedsAttention(t))
      .map((t) => t.id);
    const nextFocus = resolveWarzoneFocusTaskId({
      focusedTaskId,
      eligibleIds,
      needsYouIds,
    });

    if (nextFocus === focusedTaskId) return;
    setParams((prev) => applyWarzoneTaskParam(prev, nextFocus), {
      replace: true,
    });
  }, [
    eligibleIdsKey,
    focusedTaskId,
    createSlot,
    setParams,
    eligible,
    eligibleIds,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }

      if (e.key === 'Escape') {
        if (createSlot != null) {
          TaskFormDialog.hide();
          pendingCreateSlotRef.current = null;
          setCreateSlot(null);
          return;
        }
        if (focusedTaskId) {
          userClearedFocusRef.current = true;
          setParams((prev) => applyWarzoneTaskParam(prev, null), {
            replace: true,
          });
        }
        return;
      }

      const slot = SLOT_KEY_MAP[e.key];
      if (!slot) return;
      const taskId = assignment.get(slot);
      if (!taskId) return;

      userClearedFocusRef.current = false;
      setCreateSlot(null);
      setParams((prev) => applyWarzoneTaskParam(prev, taskId), {
        replace: true,
      });
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assignment, createSlot, focusedTaskId, setParams]);

  const selectTask = (taskId: string) => {
    userClearedFocusRef.current = false;
    setCreateSlot(null);
    setParams((prev) => applyWarzoneTaskParam(prev, taskId), { replace: true });
  };

  const openFullTask = (task: TaskAcrossProjects) => {
    if (isWarzoneMockTaskId(task.id)) return;
    navigate(paths.task(task.projectId, task.id));
  };

  const startCreate = (slot: number) => {
    if (mockMode) return;
    userClearedFocusRef.current = false;
    pendingCreateSlotRef.current = slot;
    setCreateSlot(slot);
    void openTaskForm({
      mode: 'create',
      projectId: projectFilter ?? undefined,
      preventNavigate: true,
      onCreateSuccess: (created) => {
        const reservedSlot = pendingCreateSlotRef.current;
        if (reservedSlot == null) return;
        userClearedFocusRef.current = false;
        setReserved({ slot: reservedSlot, taskId: created.id });
        pendingCreateSlotRef.current = null;
        setCreateSlot(null);
        setParams((prev) => applyWarzoneTaskParam(prev, created.id), {
          replace: true,
        });
      },
    }).finally(() => {
      pendingCreateSlotRef.current = null;
      setCreateSlot(null);
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t('loading')}
        </div>
      ) : (
        <WarzoneGrid
          layoutId={layoutId}
          assignment={assignment}
          tasksById={tasksById}
          focusedTaskId={focusedTaskId}
          createSlot={createSlot}
          centre={
            <WarzoneFocus
              focusedTaskId={focusedTaskId}
              tasks={tasks}
              emptyMessage={
                eligible.length === 0 ? t('emptyNothingNeedsYou') : null
              }
            />
          }
          onSelectTask={selectTask}
          onOpenTask={openFullTask}
          onEmptySlot={startCreate}
        />
      )}
    </div>
  );
}
