import { useTranslation } from 'react-i18next';
import { FileDiff, PanelRight, X } from 'lucide-react';
import { Button } from '../ui/button';
import { IconAction } from '@/components/ui/icon-action';
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
