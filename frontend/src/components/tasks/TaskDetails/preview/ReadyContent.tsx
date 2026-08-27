import { ExternalLink, SquareTerminal } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface ReadyContentProps {
  url?: string;
}

/**
 * Shown while a dev server is running.
 *
 * This used to embed the app in an iframe. The embedded browser existed for the click-to-edit
 * companion, which this fork removed; without it an iframe is simply a worse browser — no
 * devtools, no extensions, no logged-in session, and sandboxed so plenty of apps won't run in it.
 * So the panel now reports the server and hands off to the real browser, and the dev server logs
 * below stay where they were.
 */
export function ReadyContent({ url }: ReadyContentProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="text-center">
        <SquareTerminal className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="font-ibm-plex-mono mt-4 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Dev server running
        </p>
        {url && (
          <p className="font-ibm-plex-mono mt-2 break-all text-sm">{url}</p>
        )}
        <Button
          className="mt-6"
          onClick={() => url && window.open(url, '_blank', 'noopener,noreferrer')}
          disabled={!url}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Open in browser
        </Button>
        <p className="mt-6 text-xs text-muted-foreground">
          Logs are below.
        </p>
      </div>
    </div>
  );
}
