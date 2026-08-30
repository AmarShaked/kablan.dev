import { useTranslation } from 'react-i18next';
import { FileDiff, PanelRight, SquareTerminal, X } from 'lucide-react';
import { Button } from '../ui/button';
import { IconAction } from '@/components/ui/icon-action';
import { useDevServer } from '@/hooks/useDevServer';
import { TooltipProvider } from '../ui/tooltip';
import type { LayoutMode } from '../layout/TasksLayout';
import type { TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '../ui/actions-dropdown';
import { usePostHog } from 'posthog-js/react';
import { WorkspaceWithSession } from '@/types/attempt';

interface AttemptHeaderActionsProps {
  onClose: () => void;
  mode?: LayoutMode;
  onModeChange?: (mode: LayoutMode) => void;
  task: TaskWithAttemptStatus;
  attempt?: WorkspaceWithSession | null;
}

export const AttemptHeaderActions = ({
  onClose,
  mode,
  onModeChange,
  task,
  attempt,
}: AttemptHeaderActionsProps) => {
  const { t } = useTranslation('tasks');
  const posthog = usePostHog();
  // Only to decide whether the logs button has anything to point at.
  const { runningDevServers, devServerProcesses } = useDevServer(attempt?.id);

  return (
    <>
      {typeof mode !== 'undefined' && onModeChange && (
        <TooltipProvider delayDuration={200} skipDelayDuration={400}>
          <div
            className="inline-flex items-center gap-0.5"
            aria-label="Layout mode"
          >
            {/* Clicking the mode already showing closes it, which is what the toggle group this
                replaced did; the panel is a toggle, not a radio. */}
            <IconAction
              icon={PanelRight}
              label={t('attemptHeaderActions.details', 'Details')}
              active={mode === 'details'}
              onClick={() =>
                onModeChange(mode === 'details' ? null : 'details')
              }
            />
            <IconAction
              icon={SquareTerminal}
              label="Dev server logs"
              active={mode === 'logs'}
              // A dot only when there is something behind the button: green while a server is
              // up, grey when one has run and its output is still there to read.
              indicator={
                runningDevServers.length > 0
                  ? 'live'
                  : devServerProcesses.length > 0
                    ? 'idle'
                    : undefined
              }
              onClick={() => onModeChange(mode === 'logs' ? null : 'logs')}
            />
            <IconAction
              icon={FileDiff}
              label={t('attemptHeaderActions.diffs')}
              active={mode === 'diffs'}
              onClick={() => {
                const next = mode === 'diffs' ? null : 'diffs';
                if (next === 'diffs') {
                  posthog?.capture('diffs_navigated', {
                    trigger: 'button',
                    timestamp: new Date().toISOString(),
                    source: 'frontend',
                  });
                } else {
                  posthog?.capture('view_closed', {
                    trigger: 'button',
                    from_view: mode ?? 'attempt',
                    timestamp: new Date().toISOString(),
                    source: 'frontend',
                  });
                }
                onModeChange(next);
              }}
            />
          </div>
        </TooltipProvider>
      )}

      {typeof mode !== 'undefined' && onModeChange && (
        <div className="h-4 w-px bg-border" />
      )}
      <ActionsDropdown task={task} attempt={attempt} />
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>
    </>
  );
};
