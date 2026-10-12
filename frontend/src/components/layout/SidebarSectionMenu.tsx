import { Check, MoreHorizontal } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarGroupAction } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import {
  SIDEBAR_SORTS,
  sidebarSortLabel,
  type SidebarFilter,
  type SidebarSort,
} from '@/lib/sidebarSection';

type FilterOption = {
  id: Exclude<SidebarFilter, 'all'>;
  label: string;
};

/**
 * The overflow on a sidebar section: filter and sort, the way Slack's channel
 * header does it. The current choice sits on the row; the check marks it in
 * the submenu.
 */
export function SidebarSectionMenu({
  label,
  sort,
  onSortChange,
  filter,
  onFilterChange,
  filterOption,
}: {
  label: string;
  sort: SidebarSort;
  onSortChange: (sort: SidebarSort) => void;
  filter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  filterOption: FilterOption;
}) {
  const filterOn = filter === filterOption.id;

  return (
    <DropdownMenu>
      <SidebarGroupAction
        asChild
        title={label}
        className={cn(
          'right-10 opacity-0 pointer-events-none transition-[transform,opacity]',
          // The header is a group/header. Touch has no hover, so the control stays
          // available there; a keyboard focus or an open menu does the same.
          'group-hover/header:pointer-events-auto group-hover/header:opacity-100',
          'focus-visible:pointer-events-auto focus-visible:opacity-100',
          'data-[state=open]:pointer-events-auto data-[state=open]:opacity-100',
          'max-md:pointer-events-auto max-md:opacity-100'
        )}
      >
        <DropdownMenuTrigger aria-label={label}>
          <MoreHorizontal />
          <span className="sr-only">{label}</span>
        </DropdownMenuTrigger>
      </SidebarGroupAction>
      <DropdownMenuContent align="start" side="bottom" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="flex-1">Filter</span>
            {filterOn && (
              <span className="text-muted-foreground">
                {filterOption.label}
              </span>
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                onFilterChange(filterOn ? 'all' : filterOption.id);
              }}
            >
              <Check
                aria-hidden
                className={cn(filterOn ? 'opacity-100' : 'opacity-0')}
              />
              {filterOption.label}
              {filterOn && <span className="sr-only">selected</span>}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="flex-1">Sort</span>
            <span className="text-muted-foreground">
              {sidebarSortLabel(sort)}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            {SIDEBAR_SORTS.map((option) => {
              const selected = sort === option.id;
              return (
                <DropdownMenuItem
                  key={option.id}
                  onSelect={(event) => {
                    event.preventDefault();
                    onSortChange(option.id);
                  }}
                >
                  <Check
                    aria-hidden
                    className={cn(selected ? 'opacity-100' : 'opacity-0')}
                  />
                  {option.label}
                  {selected && <span className="sr-only">selected</span>}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
