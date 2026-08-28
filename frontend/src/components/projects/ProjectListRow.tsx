import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown, ChevronRight, Circle, Edit, ExternalLink, FolderOpen,
  Loader2, MoreHorizontal, Trash2,
} from 'lucide-react';

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { projectsApi, tasksApi } from '@/lib/api';
import { useNavigateWithSearch, useProjectRepos } from '@/hooks';
import { useOpenProjectInEditor } from '@/hooks/useOpenProjectInEditor';
import { PROJECT_ICONS, projectIcon } from '@/components/projects/projectIcons';
import { statusLabels } from '@/utils/statusLabels';
import type { Project, ProjectWithStats, TaskWithAttemptStatus } from 'shared/types';

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
          // The row opens the project and Radix opens on pointer-down, so both are stopped or
          // picking an icon would navigate away.
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Change project icon"
          title="Change icon"
          className="flex h-9 w-9 shrink-0 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <Current className="h-[18px] w-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[336px] p-2"
        // Portals bubble through the React tree, so without this, choosing an icon would also
        // trigger the row underneath and navigate away from the list.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-8 gap-1">
          {Object.entries(PROJECT_ICONS).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-label={key}
              className={`flex h-9 w-9 items-center justify-center border transition-colors hover:bg-accent ${
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

export function ProjectListRow({
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
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<TaskWithAttemptStatus[] | null>(null);
  const { data: repos } = useProjectRepos(project.id);
  const handleOpenInEditor = useOpenProjectInEditor(project as unknown as Project);

  const taskCount = Number(project.task_count);
  const runningCount = Number(project.running_count);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    // Fetched on first expand rather than up front: most projects stay collapsed, so loading
    // every project's tasks on page load would be work nobody asked for.
    if (next && tasks === null) {
      tasksApi
        .listByProject(project.id)
        .then(setTasks)
        .catch((e) => setError(String(e)));
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Are you sure you want to delete "${project.name}"? This action cannot be undone.`
      )
    )
      return;
    try {
      await projectsApi.delete(project.id);
    } catch (e) {
      setError('Failed to delete project');
    }
  };

  const open = () => navigate(`/local-projects/${project.id}/tasks`);

  return (
    <div className="border-b border-border">
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
        className="flex items-center gap-2 py-2 pr-2 transition-colors hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-label={expanded ? 'Collapse tasks' : 'Expand tasks'}
          aria-expanded={expanded}
          className="flex h-8 w-6 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <IconPicker
          value={project.icon}
          onChange={(icon) => onIconChange(project.id, icon)}
        />

        <span className="min-w-0 flex-1 truncate font-medium">
          {project.name}
        </span>

        {runningCount > 0 && (
          <span className="font-ibm-plex-mono shrink-0 bg-info/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-info">
            {runningCount} running
          </span>
        )}

        <span className="font-ibm-plex-mono shrink-0 text-xs tabular-nums text-muted-foreground">
          {taskCount === 0
            ? 'no tasks'
            : `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`}
        </span>

        {repos && repos.length > 0 && (
          <span className="hidden shrink-0 font-ibm-plex-mono text-xs text-muted-foreground sm:inline">
            {repos.length === 1 ? repos[0].display_name : `${repos.length} repos`}
          </span>
        )}

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
          <DropdownMenuContent
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
            <DropdownMenuItem onClick={open}>
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('viewProject')}
            </DropdownMenuItem>
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
            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              {t('common:buttons.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded && (
        <div className="pb-2 pl-[52px] pr-2">
          {tasks === null ? (
            <p className="flex items-center py-2 text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              Loading tasks…
            </p>
          ) : tasks.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">No tasks yet.</p>
          ) : (
            <ul>
              {tasks.map((task) => (
                <li key={task.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/local-projects/${project.id}/tasks/${task.id}`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(`/local-projects/${project.id}/tasks/${task.id}`);
                      }
                    }}
                    className="flex cursor-pointer items-center gap-3 border-t border-border/60 py-2 text-sm transition-colors hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <Circle className="h-2 w-2 shrink-0 fill-current text-muted-foreground/40" />
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    {task.has_in_progress_attempt && (
                      <span className="font-ibm-plex-mono shrink-0 bg-info/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-info">
                        Running
                      </span>
                    )}
                    {task.has_running_dev_server && (
                      <span className="font-ibm-plex-mono shrink-0 bg-success/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-success">
                        Server
                      </span>
                    )}
                    <span className="font-ibm-plex-mono shrink-0 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      {statusLabels[task.status]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
