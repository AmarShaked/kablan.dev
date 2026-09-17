import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useEffect,
} from 'react';
import { useLocation } from 'react-router-dom';
import type { Project } from 'shared/types';
import { useProjects } from '@/hooks/useProjects';

interface ProjectContextValue {
  projectId: string | undefined;
  project: Project | undefined;
  isLoading: boolean;
  error: Error | null;
  isError: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

interface ProjectProviderProps {
  children: ReactNode;
  /**
   * Override the project for nested trees (e.g. Warzone focus). When omitted,
   * the id comes from `/local-projects/:id` as before.
   */
  projectId?: string;
}

export function ProjectProvider({
  children,
  projectId: projectIdProp,
}: ProjectProviderProps) {
  const location = useLocation();

  const routeProjectId = useMemo(() => {
    const match = location.pathname.match(/^\/local-projects\/([^/]+)/);
    return match ? match[1] : undefined;
  }, [location.pathname]);

  const projectId = projectIdProp ?? routeProjectId;

  const { projectsById, isLoading, error } = useProjects();
  const project = projectId ? projectsById[projectId] : undefined;

  const value = useMemo(
    () => ({
      projectId,
      project,
      isLoading,
      error,
      isError: !!error,
    }),
    [projectId, project, isLoading, error]
  );

  // Route-owned title only — nested overrides must not fight the shell provider.
  useEffect(() => {
    if (projectIdProp !== undefined) return;
    if (project) {
      document.title = `${project.name} | Kablan`;
    } else {
      document.title = 'Kablan';
    }
  }, [project, projectIdProp]);

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

/**
 * The project of the page you are on, or nothing when the page is not about one project.
 *
 * The cross-project list renders the same task components as a project page does; those need the
 * project a task belongs to, which they are given, not the one the route names.
 */
export function useOptionalProject(): ProjectContextValue | null {
  return useContext(ProjectContext);
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
