import { useTranslation } from 'react-i18next';
import { Edit, FolderOpen, MoreHorizontal, Trash2 } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/dialogs';
import { projectsApi } from '@/lib/api';
import { useNavigateWithSearch, useProjectRepos } from '@/hooks';
import { useOpenProjectInEditor } from '@/hooks/useOpenProjectInEditor';
import { PROJECT_ICONS, projectIcon } from '@/components/projects/projectIcons';
import type { Project, ProjectWithStats } from 'shared/types';

/** Icon grid, matching the picker in the mock. */
function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (key: string) => void;
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
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <Current className="h-5 w-5" />
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

/**
 * One project, as a card.
 *
 * The rows this replaces could expand to list a project's tasks inline, which meant the projects
 * page was a second, worse place to read tasks: no board, no search, no filters, and a fetch per
 * project the moment you opened one. Opening the project is one click away and does all of that
 * properly, so the card says how much work is there and how much of it is moving, and leaves the
 * reading to the project's own page.
 */
export function ProjectCard({
  project,
  onEdit,
  setError,
  onIconChange,
}: {
  project: ProjectWithStats;
  onEdit: (project: Project) => void;
  setError: (message: string) => void;
  onIconChange: (projectId: string, icon: string) => void;
}) {
  const navigate = useNavigateWithSearch();
  const { t } = useTranslation('projects');
  const { data: repos } = useProjectRepos(project.id);
  const handleOpenInEditor = useOpenProjectInEditor(
    project as unknown as Project
  );

  const taskCount = Number(project.task_count);
  const runningCount = Number(project.running_count);

  const handleDelete = async () => {
    const result = await ConfirmDialog.show({
      title: `Delete ${project.name}?`,
      message:
        'The project and its tasks are removed from Kablan. The repositories on disk are left alone.',
      confirmText: 'Delete',
      variant: 'destructive',
    }).catch(() => 'canceled');
    if (result !== 'confirmed') return;
    try {
      await projectsApi.delete(project.id);
    } catch (e) {
      setError('Failed to delete project');
    }
  };

  const open = () => navigate(`/local-projects/${project.id}/tasks`);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      // Every card carries a left stripe, so the card's leading edge is a place you learn to
      // read: blue while something is running in the project, and a plain rule otherwise —
      // present either way, so cards don't shift by two pixels when work starts.
      className={`flex h-full flex-col rounded-lg border border-border border-l-2 p-3 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
        runningCount > 0 ? 'border-l-info' : 'border-l-foreground/25'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <IconPicker
          value={project.icon}
          onChange={(icon) => onIconChange(project.id, icon)}
        />

        <span className="min-w-0 flex-1 truncate font-medium">
          {project.name}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Project actions"
              className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {repos?.length === 1 && (
              <DropdownMenuItem onClick={() => handleOpenInEditor()}>
                <FolderOpen className="mr-2 h-4 w-4" />
                {t('openInIDE')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => onEdit(project as unknown as Project)}
            >
              <Edit className="mr-2 h-4 w-4" />
              {t('common:buttons.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('common:buttons.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Pushed to the bottom so the counts line up across a row of cards. */}
      <div className="mt-auto flex items-center gap-2 pt-3">
        <span className="font-ibm-plex-mono text-xs tabular-nums text-muted-foreground">
          {taskCount === 0
            ? 'no tasks'
            : `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`}
        </span>
        {runningCount > 0 && (
          <span className="font-ibm-plex-mono ml-auto shrink-0 bg-info/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-info">
            {runningCount} running
          </span>
        )}
      </div>
    </div>
  );
}
