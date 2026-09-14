import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { IntegrationIcon } from '@/components/integrations/IntegrationIcon';
import { useConfiguredIntegrations } from '@/hooks/useConfiguredIntegrations';
import {
  buildIntegrationPath,
  firstIntegrationPath,
} from '@/lib/routes/integrationRoutes';
import { cn } from '@/lib/utils';
import type { IntegrationProvider } from 'shared/types';

export function AddIntegrationPage() {
  const navigate = useNavigate();
  const { unconfiguredIntegrations, enabledIntegrations, addIntegration } =
    useConfiguredIntegrations();
  const available = unconfiguredIntegrations.filter((item) => item.available);
  const [picked, setPicked] = useState<IntegrationProvider | null>(null);

  const selected =
    (picked && available.some((item) => item.provider === picked)
      ? picked
      : available[0]?.provider) ?? null;

  const handleContinue = () => {
    if (!selected) return;
    addIntegration(selected);
    navigate(buildIntegrationPath(selected));
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Add integration</h1>
        <p className="text-sm text-muted-foreground">
          Connect a task tracker. Assigned tickets show up in the sidebar, and
          you can start one as a Kablan task.
        </p>
      </div>

      {unconfiguredIntegrations.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Every available integration is already in the sidebar.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {unconfiguredIntegrations.map((item) => {
            const active = selected === item.provider;
            return (
              <button
                key={item.provider}
                type="button"
                disabled={!item.available}
                onClick={() => item.available && setPicked(item.provider)}
                className={cn(
                  'flex flex-col items-start gap-2.5 rounded-md border p-3.5 text-left',
                  !item.available && 'cursor-not-allowed opacity-60',
                  active
                    ? 'border-primary bg-muted/60'
                    : 'hover:bg-muted/40 disabled:hover:bg-transparent'
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <IntegrationIcon
                    provider={item.provider}
                    className="h-5 w-5"
                  />
                  {!item.available && (
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Soon
                    </span>
                  )}
                </div>
                <span className="space-y-0.5">
                  <span className="block text-sm font-semibold">
                    {item.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {item.blurb}
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
          onClick={() => navigate(firstIntegrationPath(enabledIntegrations))}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
