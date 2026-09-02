import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PROJECT_ICONS, projectIcon } from '@/components/projects/projectIcons';
import { cn } from '@/lib/utils';

/**
 * The project's icon, and the grid for changing it.
 *
 * A project is picked out of a list by its icon before its name is read, so the icon is worth
 * choosing — and the only way to choose it is to be able to click the one already there.
 */
export function IconPicker({
  value,
  onChange,
  size = 'lg',
  className,
}: {
  value: string | null;
  onChange: (key: string) => void;
  /** `sm` for a form field's height, `lg` for the project card. */
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const Current = projectIcon(value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          // The card opens the project and Radix opens on pointer-down, so both are stopped or
          // picking an icon would navigate away.
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Change project icon"
          title="Change icon"
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:text-foreground',
            size === 'lg' ? 'h-10 w-10' : 'h-9 w-9',
            className
          )}
        >
          <Current className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[336px] p-2"
        // Portals bubble through the React tree, so without this, choosing an icon would also
        // trigger the card underneath and navigate away from the list.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-8 gap-1">
          {Object.entries(PROJECT_ICONS).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-label={key}
              className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors hover:bg-accent ${
                key === value
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
