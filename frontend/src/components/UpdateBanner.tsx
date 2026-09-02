import { useState } from 'react';
import { ArrowUpCircle, Check, Copy, Loader2, X } from 'lucide-react';

import { useLatestRelease } from '@/hooks/useLatestRelease';
import { useSelfUpdate } from '@/hooks/useSelfUpdate';

const UPDATE_COMMAND = 'npx kablan@latest';

/**
 * Says when a newer Kablan exists, in the same place the development banner sits.
 *
 * The installed app can update itself: one button quits the server, runs the update and reopens.
 * When the server reports it cannot — a dev build, a bare binary — the button steps aside and the
 * copyable command takes over, so there is always a way forward and never a button that lies.
 *
 * Quieter than the development banner on purpose. That one warns you the build is not real; this
 * is news you can act on whenever you like, and it should not look like a problem.
 */
export function UpdateBanner() {
  const { latest, current, updateAvailable } = useLatestRelease();
  const { state, update } = useSelfUpdate();
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!updateAvailable || dismissed) return null;

  const updating = state.status === 'updating';
  // Once the server has said it cannot restart itself, stop offering the button and show only the
  // command — offering an action that just failed would be worse than not offering it.
  const showButton = state.status !== 'unsupported';

  return (
    <div className="shrink-0 border-b border-border bg-muted px-4 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <ArrowUpCircle className="h-4 w-4 shrink-0 text-info" />
        <span>
          Kablan <span className="font-medium">{latest}</span> is available
          <span className="text-muted-foreground"> — you have {current}</span>
        </span>

        {updating ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {state.message}
          </span>
        ) : (
          <>
            {showButton && (
              <button
                type="button"
                onClick={update}
                className="inline-flex items-center gap-1.5 rounded border border-info/40 bg-info/10 px-2 py-0.5 text-xs font-medium text-info transition-colors hover:bg-info/20"
              >
                <ArrowUpCircle className="h-3.5 w-3.5" />
                Update &amp; restart
              </button>
            )}

            <span className="text-muted-foreground">
              {showButton ? 'or run' : 'Quit and run'}
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(UPDATE_COMMAND);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              title="Copy the update command"
              className="font-ibm-plex-mono inline-flex items-center gap-1.5 rounded border border-border bg-background px-2 py-0.5 text-xs transition-colors hover:border-foreground"
            >
              {UPDATE_COMMAND}
              {copied ? (
                <Check className="h-3 w-3 text-success" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          </>
        )}

        {!updating && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="ml-1 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
