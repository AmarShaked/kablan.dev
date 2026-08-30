import { useEffect, useState } from 'react';
import { Loader2, Play, Square, SquareTerminal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import ProcessLogsViewer from '@/components/tasks/TaskDetails/ProcessLogsViewer';
import { useDevServer } from '@/hooks/useDevServer';
import { useHasDevServerScript } from '@/hooks/useHasDevServerScript';
import { useDevserverUrlFromLogs } from '@/hooks/useDevserverUrl';
import { useLogStream } from '@/hooks/useLogStream';
import { useProject } from '@/contexts/ProjectContext';
import { getDevServerWorkingDir } from '@/lib/devServerUtils';
import { cn } from '@/lib/utils';

/**
 * The dev server's output, as a pane of its own.
 *
 * It used to be a collapsible strip inside the attempt's details, where it had a couple of
 * hundred pixels to work with — enough to see that a server had started and not much else. Logs
 * are read when something is wrong, and that is exactly when you need more than eight lines, so
 * they now open in the same place the diff does.
 */
export function DevServerLogsPanel({ attemptId }: { attemptId: string }) {
  const { projectId } = useProject();
  const { data: projectHasDevScript = false } = useHasDevServerScript(projectId);
  const {
    start,
    stop,
    isStarting,
    isStopping,
    runningDevServers,
    devServerProcesses,
  } = useDevServer(attemptId);

  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    // Follow the newest process rather than pinning to whichever was first seen: after a
    // restart, the one worth reading is the one that just started.
    if (devServerProcesses.length === 0) {
      setActiveId(null);
      return;
    }
    if (!activeId || !devServerProcesses.some((p) => p.id === activeId)) {
      setActiveId(devServerProcesses[0].id);
    }
  }, [devServerProcesses, activeId]);

  const running = runningDevServers.length > 0;
  const logStream = useLogStream(runningDevServers[0]?.id ?? '');
  const url = useDevserverUrlFromLogs(logStream.logs)?.url;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <SquareTerminal
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            running ? 'text-success' : 'text-muted-foreground'
          )}
        />
        <span className="font-ibm-plex-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Dev server
        </span>

        {url ? (
          <button
            type="button"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            className="font-ibm-plex-mono min-w-0 truncate text-xs hover:underline"
            title={`Open ${url}`}
          >
            {url}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {running
              ? 'Running — waiting for a URL…'
              : projectHasDevScript
                ? 'Not running'
                : 'No dev script configured'}
          </span>
        )}

        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={isStarting || isStopping || (!running && !projectHasDevScript)}
          onClick={() => (running ? stop() : start())}
        >
          {isStarting || isStopping ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : running ? (
            <Square className="mr-1.5 h-3 w-3" />
          ) : (
            <Play className="mr-1.5 h-3 w-3" />
          )}
          {running ? 'Stop' : 'Start'}
        </Button>
      </div>

      {/* One tab per repository's server, and only when there is more than one to choose. */}
      {devServerProcesses.length > 1 && (
        <div className="flex shrink-0 border-b border-border bg-muted/30">
          {devServerProcesses.map((process) => (
            <button
              key={process.id}
              onClick={() => setActiveId(process.id)}
              className={cn(
                'border-b-2 px-3 py-1.5 text-xs transition-colors',
                activeId === process.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {getDevServerWorkingDir(process) ?? 'Dev server'}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {activeId ? (
          <ProcessLogsViewer processId={activeId} />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              No dev server has run for this attempt yet. Starting one shows its
              output here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
