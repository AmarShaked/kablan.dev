import { Volume2, VolumeX } from 'lucide-react';

import { useUserSystem } from '@/contexts/UserSystemContext';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Mutes notification sounds from the corner, without a trip through Settings.
 * It writes the same `sound_enabled` flag Settings uses, so the two stay in step
 * and the backend stops playing the alert on the next notification.
 */
export function SilenceButton() {
  const { config, updateAndSaveConfig } = useUserSystem();
  const silenced = config ? !config.notifications.sound_enabled : false;
  const label = silenced ? 'Unmute notifications' : 'Silence notifications';

  const toggle = () => {
    if (!config) return;
    void updateAndSaveConfig({
      notifications: {
        ...config.notifications,
        sound_enabled: !config.notifications.sound_enabled,
      },
    });
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={toggle}
            disabled={!config}
            aria-pressed={silenced}
            aria-label={label}
            className={cn(
              'fixed bottom-3 right-2.5 z-40 inline-flex h-9 w-9 items-center justify-center rounded-lg',
              'border border-border bg-background text-muted-foreground',
              'transition-colors hover:bg-accent hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
              silenced && 'bg-accent text-foreground'
            )}
          >
            {silenced ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
