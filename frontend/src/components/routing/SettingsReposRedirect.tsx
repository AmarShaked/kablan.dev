import { Navigate, useLocation } from 'react-router-dom';

import { settingsReposRedirectTo } from '@/lib/routes/projectRoutes';

/**
 * Sends `/settings/repos` at the project page that now holds repository
 * settings. A repoId alone cannot name a project, so that case lands on the
 * projects list.
 */
export function SettingsReposRedirect() {
  const { search } = useLocation();
  return <Navigate to={settingsReposRedirectTo(search)} replace />;
}
