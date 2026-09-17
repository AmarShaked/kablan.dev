import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { TaskAcrossProjects } from '@/hooks/useAllTasks';
import { WarzoneTile } from '@/components/warzone/WarzoneTile';
import {
  resolveWarzoneSlotAction,
  warzoneLayout,
  warzoneSlotCells,
  type WarzoneLayoutId,
} from '@/lib/warzone/slots';
import { cn } from '@/lib/utils';

type WarzoneGridProps = {
  layoutId: WarzoneLayoutId;
  assignment: Map<number, string>;
  tasksById: Map<string, TaskAcrossProjects>;
  focusedTaskId: string | null;
  createSlot: number | null;
  centre: ReactNode;
  onSelectTask: (taskId: string) => void;
  /** Double-click a filled tile → full project task page. */
  onOpenTask?: (task: TaskAcrossProjects) => void;
  onEmptySlot: (slot: number) => void;
};

const LAYOUT_GRID_CLASS: Record<WarzoneLayoutId, string> = {
  16: 'grid-cols-5 grid-rows-5',
  10: 'grid-cols-5 grid-rows-[minmax(0,1fr)_minmax(0,2.2fr)_minmax(0,1fr)]',
  5: 'grid-cols-[minmax(0,1fr)_minmax(9rem,14rem)] grid-rows-5',
};

export function WarzoneGrid({
  layoutId,
  assignment,
  tasksById,
  focusedTaskId,
  createSlot,
  centre,
  onSelectTask,
  onOpenTask,
  onEmptySlot,
}: WarzoneGridProps) {
  const { t } = useTranslation('warzone');
  const layout = warzoneLayout(layoutId);
  const cells = warzoneSlotCells(layoutId);

  return (
    <div
      className={cn('grid min-h-0 flex-1 gap-2', LAYOUT_GRID_CLASS[layoutId])}
    >
      {cells.map(({ slot, row, col }) => {
        const taskId = assignment.get(slot);
        const task = taskId ? tasksById.get(taskId) : undefined;
        const focused = Boolean(taskId && taskId === focusedTaskId);
        const creating = createSlot === slot;
        const pending = Boolean(taskId && !task);
        const action = resolveWarzoneSlotAction({
          slot,
          assignedTaskId: taskId,
          taskInList: Boolean(task),
        });

        return (
          <button
            key={slot}
            type="button"
            style={{ gridRow: row, gridColumn: col }}
            className={cn(
              'flex min-h-0 cursor-pointer items-start overflow-hidden rounded-md border p-2 text-left text-sm transition-colors',
              task
                ? 'bg-background hover:bg-accent/40'
                : pending
                  ? 'bg-muted/20 text-muted-foreground'
                  : 'border-dashed text-muted-foreground hover:bg-muted/40',
              focused && 'border-primary ring-2 ring-primary',
              creating &&
                !task &&
                'border-primary bg-primary/10 ring-2 ring-primary/50'
            )}
            onClick={() => {
              if (action.type === 'select' || action.type === 'pending') {
                onSelectTask(action.taskId);
              } else {
                onEmptySlot(action.slot);
              }
            }}
            onDoubleClick={() => {
              if (task && onOpenTask) onOpenTask(task);
            }}
          >
            {task ? (
              <WarzoneTile task={task} focused={focused} />
            ) : pending ? (
              <span className="text-xs text-muted-foreground">
                {t('starting')}
              </span>
            ) : (
              <span className="text-xs">{t('addSlot')}</span>
            )}
          </button>
        );
      })}

      <div
        className="flex min-h-0 flex-col overflow-hidden rounded-md border bg-background"
        style={{
          gridRow: layout.centre.gridRow,
          gridColumn: layout.centre.gridColumn,
        }}
      >
        {centre}
      </div>
    </div>
  );
}
