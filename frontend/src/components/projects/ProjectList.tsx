import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Project } from 'shared/types';
import { ProjectFormDialog } from '@/components/dialogs/projects/ProjectFormDialog';
import { AlertCircle, LayoutGrid, List, Loader2, Plus } from 'lucide-react';
import ProjectCard from '@/components/projects/ProjectCard.tsx';
import ProjectRow from '@/components/projects/ProjectRow.tsx';
import { useKeyCreate, Scope } from '@/keyboard';
import { useProjects } from '@/hooks/useProjects';

const PROJECT_VIEW_KEY = 'kablan.projects.view';

export function ProjectList() {
  const navigate = useNavigate();
  const { t } = useTranslation('projects');
  const { projects, isLoading, error: projectsError } = useProjects();
  const [error, setError] = useState('');
  // Remembered so the choice survives navigation and restarts; falls back to the card grid.
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem(PROJECT_VIEW_KEY) === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });

  const changeView = (next: 'grid' | 'list') => {
    setView(next);
    try {
      localStorage.setItem(PROJECT_VIEW_KEY, next);
    } catch {
      // Private browsing / blocked storage: the choice just won't persist.
    }
  };
  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(null);

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
    navigate(`/settings/projects?projectId=${project.id}`);
  };

  // Set initial focus when projects are loaded
  useEffect(() => {
    if (projects.length === 0) {
      setFocusedProjectId(null);
      return;
    }

    if (!focusedProjectId || !projects.some((p) => p.id === focusedProjectId)) {
      setFocusedProjectId(projects[0].id);
    }
  }, [projects, focusedProjectId]);

  return (
    <div className="space-y-6 p-8 pb-16 md:pb-8 h-full overflow-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border p-0.5">
            <Button
              variant={view === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => changeView('grid')}
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={view === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => changeView('list')}
              aria-label="List view"
              aria-pressed={view === 'list'}
              title="List view"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
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
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <Plus className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{t('empty.title')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('empty.description')}
            </p>
            <Button className="mt-4" onClick={handleCreateProject}>
              <Plus className="mr-2 h-4 w-4" />
              {t('empty.createFirst')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div
          className={
            view === 'grid'
              ? 'grid gap-6 md:grid-cols-2 lg:grid-cols-3'
              : 'rounded-md border border-border overflow-hidden'
          }
        >
          {projects.map((project) =>
            view === 'grid' ? (
              <ProjectCard
                key={project.id}
                project={project}
                isFocused={focusedProjectId === project.id}
                setError={setError}
                onEdit={handleEditProject}
              />
            ) : (
              <ProjectRow
                key={project.id}
                project={project}
                isFocused={focusedProjectId === project.id}
                setError={setError}
                onEdit={handleEditProject}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
