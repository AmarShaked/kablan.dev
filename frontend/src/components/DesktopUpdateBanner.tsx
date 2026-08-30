import { useEffect, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  type AvailableUpdate,
  checkForDesktopUpdate,
  isDesktop,
} from '@/lib/desktopUpdate';

/**
 * Offers the update when the desktop app finds one.
 *
 * Deliberately an offer and not an automatic restart: agents run inside this process, and
 * relaunching underneath one that is mid-task would kill it. So the banner waits, and the person
 * picks the moment.
 *
 * Renders nothing in the browser, where there is no app to replace.
 */
export function DesktopUpdateBanner() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;
    checkForDesktopUpdate().then((found) => {
      if (!cancelled) setUpdate(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update || dismissed) return null;

  const install = async () => {
    setInstalling(true);
    setError(null);
    try {
      // Resolves only on failure; a success replaces the process.
      await update.install();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setInstalling(false);
    }
  };

  return (
    <div className="shrink-0 border-b border-border bg-muted">
      <div className="flex items-center gap-3 px-4 py-2">
        <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 truncate text-sm">
          {error ? (
            <span className="text-destructive">
              Couldn&rsquo;t install {update.version}: {error}
            </span>
          ) : (
            <>
              Kablan {update.version} is available.{' '}
              <span className="text-muted-foreground">
                Installing restarts the app, so finish anything an agent is
                doing first.
              </span>
            </>
          )}
        </p>
        <Button size="sm" onClick={install} disabled={installing}>
          {installing ? (
            <>
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              Installing…
            </>
          ) : error ? (
            'Try again'
          ) : (
            'Install and restart'
          )}
        </Button>
        <Button
          variant="icon"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          disabled={installing}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
