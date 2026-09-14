import {
  Calendar,
  CircleDot,
  ExternalLink,
  Flag,
  FolderKanban,
  Hash,
  Tag,
  User,
  Users,
} from 'lucide-react';

import { LinearStatusBadge } from '@/components/integrations/LinearStatusBadge';
import { IconAction } from '@/components/ui/icon-action';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { IntegrationIssue } from '@/lib/integrations/linear';
import { cn } from '@/lib/utils';
import { relativeDay } from '@/utils/relativeDay';

/**
 * Linear ticket properties, as a column beside the description — the same shape as the
 * task details pane: a label on the left, the value on the same row.
 */

const VALUE =
  'flex min-h-6 min-w-0 flex-1 items-center rounded px-1.5 text-[11px]';

function Property({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof CircleDot;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full items-start gap-2 px-2 py-1">
      <span className="flex w-[6.5rem] shrink-0 items-center gap-1.5 pt-1 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span className={cn(VALUE, '-mr-1.5')}>{children}</span>
    </div>
  );
}

function formatDueDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function LinearIssueDetailsPanel({
  issue,
  hour12,
}: {
  issue: IntegrationIssue;
  hour12: boolean;
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto border-l border-border bg-background p-2">
      <TooltipProvider delayDuration={200} skipDelayDuration={400}>
        <div className="mb-1.5 flex items-center justify-end gap-0.5 border-b border-border px-1 pb-1.5">
          <IconAction
            icon={ExternalLink}
            label="Open in Linear"
            onClick={() =>
              window.open(issue.url, '_blank', 'noopener,noreferrer')
            }
          />
        </div>
      </TooltipProvider>

      <Property icon={CircleDot} label="Status">
        <LinearStatusBadge
          name={issue.status}
          type={issue.statusType}
          color={issue.statusColor}
          size="md"
        />
      </Property>
      <Property icon={User} label="Assignee">
        {issue.assignee ?? 'Unassigned'}
      </Property>
      <Property icon={Users} label="Team">
        {issue.team}
      </Property>
      <Property icon={FolderKanban} label="Project">
        {issue.project ?? 'None'}
      </Property>
      <Property icon={Calendar} label="Cycle">
        {issue.cycle ?? 'No cycle'}
      </Property>
      <Property icon={Flag} label="Priority">
        {issue.priority}
      </Property>
      <Property icon={Tag} label="Labels">
        {issue.labels.length === 0 ? (
          'None'
        ) : (
          <span className="flex flex-wrap gap-1 py-0.5">
            {issue.labels.map((label) => (
              <span
                key={label}
                className="rounded-md border px-1.5 py-px text-[11px] text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </span>
        )}
      </Property>
      <Property icon={Hash} label="Estimate">
        {issue.estimate == null ? 'None' : String(issue.estimate)}
      </Property>
      <Property icon={Calendar} label="Due">
        {issue.dueDate ? formatDueDate(issue.dueDate) : 'None'}
      </Property>
      <Property icon={Calendar} label="Created">
        {relativeDay(issue.createdAt, hour12)}
      </Property>
      <Property icon={Calendar} label="Updated">
        {relativeDay(issue.updatedAt, hour12)}
      </Property>
      <Property icon={Hash} label="ID">
        <span className="font-ibm-plex-mono">{issue.identifier}</span>
      </Property>
    </div>
  );
}
