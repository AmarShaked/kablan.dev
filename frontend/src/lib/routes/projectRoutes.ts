export function buildProjectSettingsPath(
  projectId: string,
  repoId?: string
): string {
  const path = `/local-projects/${projectId}/settings`;
  return repoId ? `${path}?repo=${encodeURIComponent(repoId)}` : path;
}

export function isProjectSettingsPath(pathname: string): boolean {
  return /^\/local-projects\/[^/]+\/settings\/?$/.test(pathname);
}

export function settingsProjectsRedirectTo(search: string): string {
  const projectId = new URLSearchParams(search).get('projectId');
  return projectId ? buildProjectSettingsPath(projectId) : '/local-projects';
}

export function settingsReposRedirectTo(search: string): string {
  const params = new URLSearchParams(search);
  const repoId = params.get('repoId') ?? params.get('repo');
  if (!repoId) return '/local-projects';
  const projectId = params.get('projectId');
  return projectId
    ? buildProjectSettingsPath(projectId, repoId)
    : '/local-projects';
}
