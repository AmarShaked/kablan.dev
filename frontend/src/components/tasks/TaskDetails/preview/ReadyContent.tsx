import { Copy, ExternalLink, Loader2, Pause, SquareTerminal } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface ReadyContentProps {
  url?: string;
  onStop: () => void;
  isStopping: boolean;
}

/**
 * Shown while a dev server is running.
 *
 * This used to embed the app in an iframe behind a browser-style toolbar. The embedded browser
 * existed for the click-to-edit companion, which this fork removed; without it an iframe is a
 * worse browser — no devtools, no extensions, no session — and the toolbar's refresh only ever
 * reloaded that iframe. So the panel reports the server and offers the two things still worth
 * doing: open it properly, and stop it. The dev server logs sit below.
 */
export function ReadyContent({ url, onStop, isStopping }: ReadyContentProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="text-center">
        <SquareTerminal className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="font-ibm-plex-mono mt-4 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Dev server running
        </p>

        {url && (
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="font-ibm-plex-mono break-all text-sm">{url}</span>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(url)}
              aria-label="Copy URL"
              title="Copy URL"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-2">
          <Button
            onClick={() => url && window.open(url, '_blank', 'noopener,noreferrer')}
            disabled={!url}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open in browser
          </Button>
          <Button variant="outline" onClick={onStop} disabled={isStopping}>
            {isStopping ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Pause className="mr-2 h-4 w-4" />
            )}
            {isStopping ? 'Stopping…' : 'Stop server'}
          </Button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">Logs are below.</p>
      </div>
    </div>
  );
}
