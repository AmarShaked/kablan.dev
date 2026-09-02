import { useState } from 'react';
import { ArrowUpCircle, Check, Copy, Loader2 } from 'lucide-react';

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
import { useSelfUpdate } from '@/hooks/useSelfUpdate';

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
  const { state, update } = useSelfUpdate();
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
              You have {current}.{' '}
              {state.status === 'unsupported'
                ? 'This build cannot restart itself — quit and run the command.'
                : 'Update and reopen in one step, or run the command yourself.'}
            </p>

            {state.status === 'updating' ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {state.message}
              </p>
            ) : (
              state.status !== 'unsupported' && (
                <button
                  type="button"
                  onClick={update}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-info/40 bg-info/10 px-2 py-1.5 text-xs font-medium text-info transition-colors hover:bg-info/20"
                >
                  <ArrowUpCircle className="h-3.5 w-3.5" />
                  Update &amp; restart
                </button>
              )
            )}

            {/* Always here as the fallback: if the app cannot restart itself, this is the way. */}
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
