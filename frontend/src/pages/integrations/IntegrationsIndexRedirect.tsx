import { Navigate } from 'react-router-dom';
import { firstIntegrationPath } from '@/lib/routes/integrationRoutes';
import { useConfiguredIntegrations } from '@/hooks/useConfiguredIntegrations';

export function IntegrationsIndexRedirect() {
  const { enabledIntegrations } = useConfiguredIntegrations();
  return <Navigate to={firstIntegrationPath(enabledIntegrations)} replace />;
}
