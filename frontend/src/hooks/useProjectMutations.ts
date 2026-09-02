import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { CreateProject, UpdateProject, Project } from 'shared/types';
import { projectKeys } from '@/lib/queryKeys';

interface UseProjectMutationsOptions {
  onCreateSuccess?: (project: Project) => void;
  onCreateError?: (err: unknown) => void;
  onUpdateSuccess?: (project: Project) => void;
  onUpdateError?: (err: unknown) => void;
}

export function useProjectMutations(options?: UseProjectMutationsOptions) {
  const queryClient = useQueryClient();

  const createProject = useMutation({
    mutationKey: ['createProject'],
    mutationFn: (data: CreateProject) => projectsApi.create(data),
    onSuccess: (project: Project) => {
      queryClient.setQueryData(projectKeys.detail(project.id), project);
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      options?.onCreateSuccess?.(project);
    },
    onError: (err) => {
      console.error('Failed to create project:', err);
      options?.onCreateError?.(err);
    },
  });

  const updateProject = useMutation({
    mutationKey: ['updateProject'],
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: UpdateProject;
    }) => projectsApi.update(projectId, data),
    onSuccess: (project: Project) => {
      // Update single project cache
      queryClient.setQueryData(projectKeys.detail(project.id), project);

      // Update the project in the projects list cache immediately
      queryClient.setQueryData<Project[]>(projectKeys.all, (old) => {
        if (!old) return old;
        return old.map((p) => (p.id === project.id ? project : p));
      });

      // Those two writes are the fast path, and they are not the whole story: the sidebar, the
      // project list and the cross-project task page all read `['projects', 'with-stats']`,
      // which is a different entry and was left holding the old name and icon until a reload.
      // Invalidating the prefix catches that one and any other projects query added later.
      queryClient.invalidateQueries({ queryKey: projectKeys.all });

      options?.onUpdateSuccess?.(project);
    },
    onError: (err) => {
      console.error('Failed to update project:', err);
      options?.onUpdateError?.(err);
    },
  });

  return {
    createProject,
    updateProject,
  };
}
