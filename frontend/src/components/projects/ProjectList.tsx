import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Project } from 'shared/types';
import { ProjectFormDialog } from '@/components/dialogs/projects/ProjectFormDialog';
import { AlertCircle, Loader2, Plus } from 'lucide-react';
import { ProjectsEmptyState } from '@/components/projects/ProjectsEmptyState';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { useKeyCreate, Scope } from '@/keyboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectStatsApi, projectsApi } from '@/lib/api';
import { projectKeys } from '@/lib/queryKeys';
import { buildProjectSettingsPath } from '@/lib/routes/projectRoutes';

export function ProjectList() {
  const navigate = useNavigate();
  const { t } = useTranslation('projects');
  const queryClient = useQueryClient();
  const {
    data: projects = [],
    isLoading,
    error: projectsError,
  } = useQuery({
    queryKey: projectKeys.withStats,
    queryFn: projectStatsApi.listWithStats,
  });
  const [error, setError] = useState('');

  const setProjectIcon = async (projectId: string, icon: string) => {
    // Optimistic: picking an icon is a single click, so waiting on the round trip would make the
    // picker feel stuck. Refetch afterwards, and surface a failure rather than leaving a lie up.
    queryClient.setQueryData(
      projectKeys.withStats,
      (old: typeof projects | undefined) =>
        (old ?? []).map((p) => (p.id === projectId ? { ...p, icon } : p))
    );
    try {
      await projectsApi.update(projectId, { name: null, icon });
    } catch {
      setError('Failed to save the project icon');
    } finally {
      queryClient.invalidateQueries({ queryKey: projectKeys.withStats });
    }
  };

  const handleCreateProject = async () => {
    try {
      const result = await ProjectFormDialog.show({});
      if (result.status === 'saved') return;
    } catch (error) {
      // User cancelled - do nothing
    }
  };

  // Semantic keyboard shortcut for creating new project
  useKeyCreate(handleCreateProject, { scope: Scope.PROJECTS });

  const handleEditProject = (project: Project) => {
    navigate(buildProjectSettingsPath(project.id));
  };

  return (
    <div className="space-y-6 p-8 pb-16 md:pb-8 h-full overflow-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleCreateProject}>
            <Plus className="mr-2 h-4 w-4" />
            {t('createProject')}
          </Button>
        </div>
      </div>

      {(error || projectsError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || projectsError?.message || t('errors.fetchFailed')}
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : projects.length === 0 ? (
        <ProjectsEmptyState onCreate={handleCreateProject} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={handleEditProject}
              setError={setError}
              onIconChange={setProjectIcon}
            />
          ))}
        </div>
      )}
    </div>
  );
}
