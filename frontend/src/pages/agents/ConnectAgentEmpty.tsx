import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AvailabilityInfo, BaseCodingAgent } from 'shared/types';

import { AgentIcon } from '@/components/agents/AgentIcon';
import { CommandCopy } from '@/components/agents/CommandCopy';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { agentConnectSteps } from '@/utils/agentConnectSteps';
import { agentLabel } from '@/utils/agentLabels';
import { isAgentConnected } from '@/utils/configuredAgents';

export function ConnectAgentEmpty({
  agent,
  checking,
  onCheck,
  onRemove,
  canRemove,
}: {
  agent: BaseCodingAgent;
  checking: boolean;
  onCheck: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const steps = agentConnectSteps(agent);

  return (
    <div className="mx-auto max-w-lg space-y-6 pt-2">
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <AgentIcon agent={agent} className="h-5 w-5" />
          <h1 className="text-xl font-semibold">{agentLabel(agent)}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Not connected. It will not appear in the task picker until it is
          installed and signed in on this machine.
        </p>
      </div>

      {checking && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Waiting for login</AlertTitle>
          <AlertDescription>
            Finish sign-in in your terminal. We’ll keep checking until this
            agent is connected.
          </AlertDescription>
        </Alert>
      )}

      <ol className="space-y-4">
        {steps.map((step) => {
          const waitingOnSignIn = checking && step.n === '2';
          return (
            <li key={step.n} className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  waitingOnSignIn
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {waitingOnSignIn ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  step.n
                )}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-sm text-muted-foreground">
                  {waitingOnSignIn
                    ? 'Listening for a completed login on this machine…'
                    : step.body}
                </p>
                {step.command ? (
                  <CommandCopy command={step.command} />
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center gap-2">
        <Button disabled={checking} onClick={onCheck}>
          {checking ? 'Checking…' : 'Check connection'}
        </Button>
        <Button
          variant="ghost"
          disabled={!canRemove || checking}
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

export function useConnectionCheck(
  agent: BaseCodingAgent,
  refreshAgent: (agent: BaseCodingAgent) => Promise<AvailabilityInfo>,
  connected: boolean
) {
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setChecking(false);
  }, [agent]);

  useEffect(() => {
    if (connected) setChecking(false);
  }, [connected]);

  useEffect(() => {
    if (!checking) return;
    let cancelled = false;

    const poll = async () => {
      const info = await refreshAgent(agent);
      if (cancelled) return;
      if (isAgentConnected(info)) setChecking(false);
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 2000);
    const timeout = window.setTimeout(() => {
      if (!cancelled) setChecking(false);
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [checking, agent, refreshAgent]);

  return {
    checking,
    startChecking: () => setChecking(true),
  };
}
