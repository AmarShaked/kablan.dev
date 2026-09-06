export const paths = {
  projects: () => '/local-projects',
  projectTasks: (projectId: string) => `/local-projects/${projectId}/tasks`,
  /**
   * A task and its run are the same page: a task has exactly one run, so there is nothing to
   * choose between and nothing for the URL to name beyond the task itself.
   */
  task: (projectId: string, taskId: string) =>
    `/local-projects/${projectId}/tasks/${taskId}`,
  taskFull: (projectId: string, taskId: string) =>
    `/local-projects/${projectId}/tasks/${taskId}/full`,
};
