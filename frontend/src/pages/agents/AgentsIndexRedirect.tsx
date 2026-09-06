import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { useConfiguredAgents } from '@/hooks/useConfiguredAgents';
import { firstAgentPath } from '@/lib/routes/agentRoutes';

export function AgentsIndexRedirect() {
  const { configuredAgents, isLoading } = useConfiguredAgents();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return <Navigate to={firstAgentPath(configuredAgents)} replace />;
}
