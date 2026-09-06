import { Navigate, useLocation } from 'react-router-dom';

import { settingsProjectsRedirectTo } from '@/lib/routes/projectRoutes';

/**
 * Sends `/settings/projects` at the project page that replaced that Settings tab.
 */
export function SettingsProjectsRedirect() {
  const { search } = useLocation();
  return <Navigate to={settingsProjectsRedirectTo(search)} replace />;
}
