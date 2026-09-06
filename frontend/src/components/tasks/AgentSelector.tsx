import { Bot, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import type { ExecutorProfileId, BaseCodingAgent } from 'shared/types';
import { agentLabel } from '@/utils/agentLabels';
import { useConfiguredAgents } from '@/hooks/useConfiguredAgents';
import { filterConnectedProfiles } from '@/utils/configuredAgents';

interface AgentSelectorProps {
  profiles: Record<string, Record<string, unknown>> | null;
  selectedExecutorProfile: ExecutorProfileId | null;
  onChange: (profile: ExecutorProfileId) => void;
  disabled?: boolean;
  className?: string;
  showLabel?: boolean;
}

export function AgentSelector({
  profiles,
  selectedExecutorProfile,
  onChange,
  disabled,
  className = '',
  showLabel = false,
}: AgentSelectorProps) {
  const { connectedAgents, isLoading } = useConfiguredAgents();
  const selectedAgent = selectedExecutorProfile?.executor;
  const visibleProfiles = isLoading
    ? filterConnectedProfiles(
        profiles,
        selectedAgent ? [selectedAgent as BaseCodingAgent] : [],
        selectedAgent
      )
    : filterConnectedProfiles(profiles, connectedAgents, selectedAgent);
  const agents = visibleProfiles
    ? (Object.keys(visibleProfiles).sort() as BaseCodingAgent[])
    : [];

  if (!visibleProfiles) return null;

  return (
    <div className="flex-1">
      {showLabel && (
        <Label htmlFor="executor-profile" className="text-sm font-medium">
          Agent
        </Label>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`w-full justify-between text-xs ${showLabel ? 'mt-1.5' : ''} ${className}`}
            disabled={disabled}
            aria-label="Select agent"
          >
            <div className="flex items-center gap-1.5 w-full">
              <Bot className="h-3 w-3" />
              <span className="truncate">{agentLabel(selectedAgent)}</span>
            </div>
            <ArrowDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          {agents.length === 0 ? (
            <div className="p-2 text-sm text-muted-foreground text-center">
              No connected agents
            </div>
          ) : (
            agents.map((agent) => (
              <DropdownMenuItem
                key={agent}
                onClick={() => {
                  onChange({
                    executor: agent,
                    variant: null,
                  });
                }}
                className={selectedAgent === agent ? 'bg-accent' : ''}
              >
                {agentLabel(agent)}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
