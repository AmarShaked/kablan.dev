import { useState } from 'react';
import { Command } from 'cmdk';
import { Check } from 'lucide-react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTaskMutations } from '@/hooks/useTaskMutations';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import {
  STATUS_ORDER,
  statusColorVars,
  statusLabels,
} from '@/utils/statusLabels';

/**
 * The status glyph, and the control for changing it.
 *
 * The glyph is a ring filled in proportion to how far along the task is, so status reads by shape
 * as well as colour — it survives greyscale, colour-blindness, and being 14px on a board card.
 * Since the glyph is already what shows the status, it is also what changes it.
 */

/** How full the ring is drawn for each status. */
const FILL: Record<TaskStatus, number> = {
  todo: 0,
  inprogress: 0.5,
  inreview: 0.75,
  done: 1,
  cancelled: 0,
};

// Circumference of the inner circle the wedge is drawn with. Its stroke is thick enough to reach
// the centre, so cutting the dash to a fraction of this leaves a pie wedge.
const INNER_C = 2 * Math.PI * 3;

export function StatusGlyph({
  status,
  size = 16,
  className,
}: {
  status: TaskStatus;
  size?: number;
  className?: string;
}) {
  const fill = FILL[status];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      // Inline rather than a Tailwind class so the colour comes from the same map the
      // section and column headings read, and cannot drift from them. Held back from full
      // strength: a column of saturated glyphs competes with the titles beside them, which are
      // the thing you are actually reading.
      style={{ color: `hsl(var(${statusColorVars[status]}) / 0.7)` }}
      className={cn('shrink-0', className)}
    >
      {status === 'done' ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M4.8 8.2 L7 10.4 L11.2 6"
            fill="none"
            stroke="hsl(var(--background))"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <circle
            cx="8"
            cy="8"
            r="6.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          {fill > 0 && (
            <circle
              cx="8"
              cy="8"
              r="3"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeDasharray={`${(INNER_C * fill).toFixed(2)} ${INNER_C.toFixed(2)}`}
              transform="rotate(-90 8 8)"
            />
          )}
          {status === 'cancelled' && (
            <path
              d="M5.6 5.6 L10.4 10.4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          )}
        </>
      )}
    </svg>
  );
}

export function TaskStatusControl({
  task,
  size = 16,
  className,
  style,
  children,
}: {
  task: TaskWithAttemptStatus;
  size?: number;
  className?: string;
  /** For a trigger that carries the status colour, which lives in a CSS variable. */
  style?: React.CSSProperties;
  /**
   * Rendered inside the trigger, beside the glyph. The properties pane puts the status name here
   * so the whole value opens the menu; on a board card, where the glyph sits next to a title that
   * opens the task instead, it is left out.
   */
  children?: React.ReactNode;
}) {
  const { projectId } = useProject();
  const { updateTask } = useTaskMutations(projectId ?? undefined);
  const [open, setOpen] = useState(false);

  const setStatus = (status: TaskStatus) => {
    setOpen(false);
    if (status === task.status) return;
    // Everything but the status is null, which the server reads as "leave it alone". Echoing the
    // title back would overwrite an edit someone made while this list was on screen.
    updateTask.mutate({
      taskId: task.id,
      data: {
        title: null,
        description: null,
        status,
        parent_workspace_id: null,
        image_ids: null,
      },
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`${statusLabels[task.status]} — click to change`}
          aria-label={`Status: ${statusLabels[task.status]}. Change it`}
          // The row underneath opens the task. Radix opens on pointer-down, so it has to be held
          // off there as well as on click.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded p-1 transition-colors',
            'hover:bg-border focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            className
          )}
          style={style}
        >
          <StatusGlyph status={task.status} size={size} />
          {children}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-52 p-0"
        // Portalled content still bubbles through the React tree, so without this a click on a
        // status would also open the task behind it.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Number shortcuts, so moving a task becomes muscle memory. Ignored once something has
          // been typed, where the digit belongs to the search instead.
          const input = e.currentTarget.querySelector('input');
          if (input && input.value) return;
          const n = Number(e.key);
          if (Number.isInteger(n) && n >= 1 && n <= STATUS_ORDER.length) {
            e.preventDefault();
            setStatus(STATUS_ORDER[n - 1]);
          }
        }}
      >
        <Command loop>
          <div className="flex items-center gap-2 border-b px-2.5 py-1.5">
            <StatusGlyph status={task.status} size={14} />
            <Command.Input
              placeholder="Change status…"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-2.5 text-center text-xs text-muted-foreground">
              No matching status
            </Command.Empty>
            {STATUS_ORDER.map((status, i) => (
              <Command.Item
                key={status}
                value={statusLabels[status]}
                onSelect={() => setStatus(status)}
                className="flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1 text-xs data-[selected=true]:bg-accent"
              >
                <StatusGlyph status={status} size={14} />
                <span className="flex-1">{statusLabels[status]}</span>
                {status === task.status && (
                  <Check className="h-3 w-3 shrink-0" />
                )}
                <span className="font-ibm-plex-mono w-3 text-right text-[11px] text-muted-foreground">
                  {i + 1}
                </span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
