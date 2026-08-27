import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Edit,
  ExternalLink,
  FolderOpen,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Project } from 'shared/types';
import { projectsApi } from '@/lib/api';
import { useOpenProjectInEditor } from '@/hooks/useOpenProjectInEditor';
import { useNavigateWithSearch, useProjectRepos } from '@/hooks';

type Props = {
  project: Project;
  isFocused: boolean;
  setError: (error: string) => void;
  onEdit: (project: Project) => void;
};

/**
 * One project as a compact row, for the Projects list view.
 *
 * Deliberately offers the same actions as ProjectCard (open, open in IDE, edit, delete) and the
 * same keyboard-focus behaviour — switching layout shouldn't cost the user any capability.
 */
function ProjectRow({ project, isFocused, setError, onEdit }: Props) {
  const navigate = useNavigateWithSearch();
  const ref = useRef<HTMLDivElement>(null);
  const handleOpenInEditor = useOpenProjectInEditor(project);
  const { t } = useTranslation('projects');

  const { data: repos } = useProjectRepos(project.id);
  const isSingleRepoProject = repos?.length === 1;

  useEffect(() => {
    if (isFocused && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      ref.current.focus();
    }
  }, [isFocused]);

  const handleDelete = async () => {
    if (
      !confirm(
        `Are you sure you want to delete "${project.name}"? This action cannot be undone.`
      )
    )
      return;
    try {
      await projectsApi.delete(project.id);
    } catch (error) {
      console.error('Failed to delete project:', error);
      setError('Failed to delete project');
    }
  };

  return (
    <div
      ref={ref}
      tabIndex={isFocused ? 0 : -1}
      onClick={() => navigate(`/local-projects/${project.id}/tasks`)}
      className="flex items-center gap-4 border-b border-border px-4 py-3 cursor-pointer transition-colors hover:bg-accent focus:ring-2 focus:ring-primary outline-none"
    >
      <span className="min-w-0 flex-1 truncate font-medium">
        {project.name}
      </span>

      {repos && repos.length > 0 && (
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
          {repos.length === 1
            ? repos[0].display_name
            : `${repos.length} repositories`}
        </span>
      )}

      <span className="hidden shrink-0 items-center text-xs text-muted-foreground md:flex">
        <Calendar className="mr-1 h-3 w-3" />
        {new Date(project.created_at).toLocaleDateString()}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/local-projects/${project.id}`);
            }}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('viewProject')}
          </DropdownMenuItem>
          {isSingleRepoProject && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleOpenInEditor();
              }}
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              {t('openInIDE')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onEdit(project);
            }}
          >
            <Edit className="mr-2 h-4 w-4" />
            {t('common:buttons.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t('common:buttons.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default ProjectRow;
