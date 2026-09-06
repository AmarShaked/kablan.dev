import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AgentIcon } from '@/components/agents/AgentIcon';
import { Button } from '@/components/ui/button';
import { useConfiguredAgents } from '@/hooks/useConfiguredAgents';
import {
  buildAgentPath,
  firstAgentPath,
} from '@/lib/routes/agentRoutes';
import { cn } from '@/lib/utils';
import { agentBlurb } from '@/utils/agentProfileFields';
import { agentLabel } from '@/utils/agentLabels';
import type { BaseCodingAgent } from 'shared/types';

export function AddAgentPage() {
  const navigate = useNavigate();
  const {
    unconfiguredAgents,
    configuredAgents,
    addAgent,
    isLoading,
  } = useConfiguredAgents();
  const [picked, setPicked] = useState<BaseCodingAgent | null>(null);

  const selected =
    (picked && unconfiguredAgents.includes(picked)
      ? picked
      : unconfiguredAgents[0]) ?? null;

  if (isLoading) {
    return (
      <p className="p-6 text-sm text-muted-foreground">Loading agents…</p>
    );
  }

  const handleContinue = () => {
    if (!selected) return;
    addAgent(selected);
    navigate(buildAgentPath(selected));
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Add agent</h1>
        <p className="text-sm text-muted-foreground">
          Pick the coding agent you want to add. Next we check whether it is
          installed on this machine.
        </p>
      </div>

      {unconfiguredAgents.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Every available agent is already in the sidebar.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {unconfiguredAgents.map((agent) => {
            const active = selected === agent;
            return (
              <button
                key={agent}
                type="button"
                onClick={() => setPicked(agent)}
                className={cn(
                  'flex flex-col items-start gap-2.5 rounded-md border p-3.5 text-left',
                  active
                    ? 'border-primary bg-muted/60'
                    : 'hover:bg-muted/40'
                )}
              >
                <AgentIcon agent={agent} className="h-5 w-5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-semibold">
                    {agentLabel(agent)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {agentBlurb(agent)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button disabled={!selected} onClick={handleContinue}>
          Continue
        </Button>
        <Button
          variant="ghost"
          onClick={() => navigate(firstAgentPath(configuredAgents))}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
