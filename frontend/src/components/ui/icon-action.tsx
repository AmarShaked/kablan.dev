import type { LucideIcon } from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * A square icon button with a tooltip, for actions done often enough to be recognised by shape.
 *
 * Shared so the row above the task's properties and the view toggles in the attempt header are
 * the same button rather than two that merely resemble each other.
 *
 * Needs a TooltipProvider above it; one per row is enough, and sharing it means moving along a
 * row does not restart the delay on each button.
 */
export function IconAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Renders as held down — for a button that toggles something rather than doing it once. */
  active?: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded transition-colors',
            'hover:bg-accent hover:text-foreground',
            'disabled:pointer-events-none disabled:opacity-40',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            active ? 'bg-accent text-foreground' : 'text-muted-foreground',
            className
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="px-2 py-1 text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
