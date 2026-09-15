import { Separator } from 'react-resizable-panels';
import { cn } from '@/lib/utils';

export const MIN_PANEL_SIZE = 20;
export const COLLAPSED_SIZE = 0;

export function PanelResizeHandle({
  id,
  collapsed,
}: {
  id: string;
  collapsed: boolean;
}) {
  return (
    <Separator
      id={id}
      className={cn(
        'relative z-30 bg-border cursor-col-resize group touch-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        'focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'transition-all',
        collapsed ? 'w-6' : 'w-1'
      )}
      aria-label="Resize panels"
    >
      <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 bg-muted/90 border border-border rounded-full px-1.5 py-3 opacity-70 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shadow-sm">
        <span className="w-1 h-1 rounded-full bg-muted-foreground" />
        <span className="w-1 h-1 rounded-full bg-muted-foreground" />
        <span className="w-1 h-1 rounded-full bg-muted-foreground" />
      </div>
    </Separator>
  );
}
