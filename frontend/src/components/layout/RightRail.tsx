import { Plus, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useProject } from '@/contexts/ProjectContext';
import { useProjectRepos } from '@/hooks';
import { useOpenProjectInEditor } from '@/hooks/useOpenProjectInEditor';
import { openTaskForm } from '@/lib/openTaskForm';
import { IdeIcon, getIdeName } from '@/components/ide/IdeIcon';
import { useUserSystem } from '@/contexts/UserSystemContext';
import {
  buildProjectSettingsPath,
  isProjectSettingsPath,
} from '@/lib/routes/projectRoutes';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * The actions you take *on* the project, as a column down the right edge.
 *
 * Creating a task sat in the task list's own toolbar, opening the IDE sat at the far
 * end of the header, and project settings lived in the app Settings tab — none of
 * those belonged to their neighbours. A rail gives them somewhere to be: always in
 * the same place whatever the middle of the screen is doing. It is a column of icons,
 * so each one says what it is on hover rather than in a label.
 */

/** One rail button. Plain, not the shared Button: its size variants add padding a rail does not want. */
function RailButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-lg',
            'border border-border bg-background text-muted-foreground',
            'transition-colors hover:bg-accent hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            active && 'bg-accent text-foreground'
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

export function RightRail() {
  const { projectId, project } = useProject();
  const { data: repos } = useProjectRepos(projectId);
  const openInEditor = useOpenProjectInEditor(project || null);
  const { config } = useUserSystem();
  const navigate = useNavigate();
  const location = useLocation();

  // Nothing here is about the app, only about a project — so with no project open there is
  // nothing to show, and an empty rail would just be a stripe.
  if (!projectId) return null;

  // The same condition the header used: with several repositories there is no single thing to
  // open, and the choice belongs in the attempt rather than here.
  const canOpenInIde = repos?.length === 1;

  return (
    <TooltipProvider>
      <aside
        aria-label="Project actions"
        className="flex h-full w-14 shrink-0 flex-col items-center gap-2 bg-muted/30 py-3"
      >
        {canOpenInIde && (
          <RailButton
            label={`Open in ${getIdeName(config?.editor?.editor_type)}`}
            onClick={() => openInEditor()}
          >
            <IdeIcon
              editorType={config?.editor?.editor_type}
              className="h-4 w-4"
            />
          </RailButton>
        )}

        <RailButton
          label="Project settings"
          active={isProjectSettingsPath(location.pathname)}
          onClick={() => navigate(buildProjectSettingsPath(projectId))}
        >
          <Settings className="h-4 w-4" />
        </RailButton>

        <RailButton
          label="New task"
          onClick={() => openTaskForm({ mode: 'create', projectId })}
        >
          <Plus className="h-4 w-4" />
        </RailButton>
      </aside>
    </TooltipProvider>
  );
}
