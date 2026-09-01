import { useState } from 'react';
import { ArrowUpCircle, Check, Copy } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLatestRelease } from '@/hooks/useLatestRelease';

const UPDATE_COMMAND = 'npx kablan@latest';

/**
 * What this build is, next to the name it belongs to.
 *
 * Both of these used to be full-width bands across the top of the window. A development build and
 * an available update are facts about the app, not events — they were taking a permanent stripe
 * of vertical space each to say something you read once and then stopped seeing. As badges beside
 * the wordmark they stay visible without costing the page a row.
 */
export function BuildBadges() {
  const { latest, current, updateAvailable } = useLatestRelease();
  const [copied, setCopied] = useState(false);

  const isDev = import.meta.env.MODE === 'development';
  if (!isDev && !updateAvailable) return null;

  return (
    <span className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
      {isDev && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Badge
                variant="outline"
                className="border-warning/40 px-1.5 py-0 text-[10px] font-medium uppercase tracking-[0.1em] text-warning"
              >
                Dev
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">
            This is a development build
          </TooltipContent>
        </Tooltip>
      )}

      {updateAvailable && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label={`Kablan ${latest} is available`}>
              <Badge
                variant="outline"
                className="cursor-pointer gap-1 border-info/40 px-1.5 py-0 text-[10px] font-medium text-info"
              >
                <ArrowUpCircle className="h-3 w-3" />
                {latest}
              </Badge>
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-64 p-3">
            <p className="text-sm font-medium">Kablan {latest} is available</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              You have {current}. Kablan runs from a downloaded binary, so
              updating means quitting and running the command again.
            </p>
            {/* The command, not an install button: nothing in the page can replace the binary
                it is running from. */}
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(UPDATE_COMMAND);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="mt-2 inline-flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs transition-colors hover:border-foreground"
            >
              {UPDATE_COMMAND}
              {copied ? (
                <Check className="h-3 w-3 text-success" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}
