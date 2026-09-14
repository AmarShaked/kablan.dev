import { Check, ListFilter } from 'lucide-react';
import type { LinearIdName, LinearWorkflowState } from 'shared/types';

import {
  LinearStatusBadge,
  linearStatusTypeFromName,
} from '@/components/integrations/LinearStatusBadge';
import { FilterChip } from '@/components/tasks/TaskFilterMenu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ALL_ASSIGNEES,
  ASSIGNED_TO_ME,
  UNASSIGNED,
  assigneeFilterLabel,
  groupStatesByType,
  linearFiltersActive,
  otherUsers,
  statusFilterLabel,
  teamFilterLabel,
  uniqueStatusesForFilter,
  type LinearFilters,
} from '@/lib/integrations/linearFilters';
import { cn } from '@/lib/utils';

export function LinearFilterMenu({
  value,
  onChange,
  states,
  teams,
  users,
  viewerId,
}: {
  value: LinearFilters;
  onChange: (next: LinearFilters) => void;
  states: LinearWorkflowState[];
  teams: LinearIdName[];
  users: LinearIdName[];
  viewerId: string | null;
}) {
  const statusGroups = groupStatesByType(
    uniqueStatusesForFilter(states, value.team)
  );
  const assignees = otherUsers(users, viewerId);
  const selectedStatusName = statusFilterLabel(value.status);
  const selectedTeamName = teamFilterLabel(value.team, teams);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Filter tickets"
          title="Filter"
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            'data-[state=open]:bg-accent data-[state=open]:text-foreground',
            linearFiltersActive(value) && 'bg-accent text-foreground'
          )}
        >
          <ListFilter className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Status
            <span className="ml-auto mr-1 max-w-[7rem] truncate text-xs text-muted-foreground">
              {value.status === 'all' ? 'Any' : selectedStatusName}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-56 overflow-auto">
            <DropdownMenuItem
              onClick={() => onChange({ ...value, status: 'all' })}
            >
              <span className="min-w-0 flex-1 truncate">Any status</span>
              {value.status === 'all' && (
                <Check className="h-3.5 w-3.5 shrink-0" />
              )}
            </DropdownMenuItem>
            {statusGroups.map((group) => (
              <div key={group.type}>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </DropdownMenuLabel>
                {group.states.map((state) => (
                  <DropdownMenuItem
                    key={`${group.type}:${state.name}`}
                    onClick={() => onChange({ ...value, status: state.name })}
                  >
                    <LinearStatusBadge
                      name={state.name}
                      type={linearStatusTypeFromName(state.type_name)}
                      color={state.color}
                      className="min-w-0 flex-1"
                    />
                    {value.status === state.name && (
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Assign to
            <span className="ml-auto mr-1 max-w-[7rem] truncate text-xs text-muted-foreground">
              {value.assignee === ASSIGNED_TO_ME
                ? 'You'
                : value.assignee === ALL_ASSIGNEES
                  ? 'Anyone'
                  : value.assignee === UNASSIGNED
                    ? 'Unassigned'
                    : assigneeFilterLabel(value.assignee, users)}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-52 overflow-auto">
            <DropdownMenuItem
              onClick={() => onChange({ ...value, assignee: ASSIGNED_TO_ME })}
            >
              <span className="min-w-0 flex-1 truncate">Assigned to you</span>
              {value.assignee === ASSIGNED_TO_ME && (
                <Check className="h-3.5 w-3.5 shrink-0" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onChange({ ...value, assignee: ALL_ASSIGNEES })}
            >
              <span className="min-w-0 flex-1 truncate">Anyone</span>
              {value.assignee === ALL_ASSIGNEES && (
                <Check className="h-3.5 w-3.5 shrink-0" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onChange({ ...value, assignee: UNASSIGNED })}
            >
              <span className="min-w-0 flex-1 truncate">Unassigned</span>
              {value.assignee === UNASSIGNED && (
                <Check className="h-3.5 w-3.5 shrink-0" />
              )}
            </DropdownMenuItem>
            {assignees.length > 0 && <DropdownMenuSeparator />}
            {assignees.map((user) => (
              <DropdownMenuItem
                key={user.id}
                onClick={() => onChange({ ...value, assignee: user.id })}
              >
                <span className="min-w-0 flex-1 truncate">{user.name}</span>
                {value.assignee === user.id && (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Team
            <span className="ml-auto mr-1 max-w-[7rem] truncate text-xs text-muted-foreground">
              {value.team === 'all' ? 'Any' : selectedTeamName}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-52 overflow-auto">
            <DropdownMenuItem
              onClick={() => onChange({ ...value, team: 'all' })}
            >
              <span className="min-w-0 flex-1 truncate">Any team</span>
              {value.team === 'all' && (
                <Check className="h-3.5 w-3.5 shrink-0" />
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {teams.map((team) => (
              <DropdownMenuItem
                key={team.id}
                onClick={() => onChange({ ...value, team: team.id })}
              >
                <span className="min-w-0 flex-1 truncate">{team.name}</span>
                {value.team === team.id && (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LinearFilterChips({
  value,
  onChange,
  teams,
  users,
}: {
  value: LinearFilters;
  onChange: (next: LinearFilters) => void;
  states?: LinearWorkflowState[];
  teams: LinearIdName[];
  users: LinearIdName[];
}) {
  if (!linearFiltersActive(value)) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {value.status !== 'all' && (
        <FilterChip
          label={statusFilterLabel(value.status)}
          onClear={() => onChange({ ...value, status: 'all' })}
        />
      )}
      {value.assignee !== ASSIGNED_TO_ME && (
        <FilterChip
          label={assigneeFilterLabel(value.assignee, users)}
          onClear={() => onChange({ ...value, assignee: ASSIGNED_TO_ME })}
        />
      )}
      {value.team !== 'all' && (
        <FilterChip
          label={teamFilterLabel(value.team, teams)}
          onClear={() => onChange({ ...value, team: 'all' })}
        />
      )}
      {value.q.trim() !== '' && (
        <FilterChip
          label={`“${value.q.trim()}”`}
          onClear={() => onChange({ ...value, q: '' })}
        />
      )}
    </div>
  );
}
