import { useState } from 'react';
import { ArrowUpCircle, Check, Copy, X } from 'lucide-react';

import { useLatestRelease } from '@/hooks/useLatestRelease';

const UPDATE_COMMAND = 'npx kablan@latest';

/**
 * Says when a newer Kablan exists, in the same place the development banner sits.
 *
 * It cannot install anything: Kablan is a binary the npm wrapper fetched, so updating means
 * quitting and running the command again. So the banner's job is to be noticed, name the version,
 * and hand over the exact command — not to pretend there is a button that does it.
 *
 * Quieter than the development banner on purpose. That one warns you the build is not real; this
 * is news you can act on whenever you like, and it should not look like a problem.
 */
export function UpdateBanner() {
  const { latest, current, updateAvailable } = useLatestRelease();
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!updateAvailable || dismissed) return null;

  return (
    <div className="shrink-0 border-b border-border bg-muted px-4 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <ArrowUpCircle className="h-4 w-4 shrink-0 text-info" />
        <span>
          Kablan <span className="font-medium">{latest}</span> is available
          <span className="text-muted-foreground"> — you have {current}</span>
        </span>

        <span className="text-muted-foreground">Quit and run</span>
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

        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="ml-1 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
