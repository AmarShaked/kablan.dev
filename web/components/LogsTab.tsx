import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Square, RotateCw, ArrowDown } from "lucide-react";
import { api, type ProjectSummary, type RunningServer, type LogLine } from "../api.ts";
import { Button } from "@/components/ui/button";
import { StatusDot } from "./StatusDot.tsx";
import { cn } from "@/lib/utils";

// Strip ANSI escape sequences some tools emit even without a TTY.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;
const stripAnsi = (s: string) => s.replace(ANSI, "");

const STATUS_LABEL: Record<string, string> = {
  starting: "Starting…",
  running: "Running",
  stopped: "Stopped",
  exited: "Exited",
  error: "Error",
};

export function LogsTab({
  project,
  server,
  logs,
}: {
  project: ProjectSummary;
  server: RunningServer | null;
  logs: LogLine[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const running = server?.status === "running" || server?.status === "starting";

  const stop = async () => {
    setBusy(true);
    try {
      await api.stopServer(project.name);
      toast.success("Server stopped");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };

  const restart = async () => {
    setBusy(true);
    try {
      await api.startServer(project.name, { cwd: server?.cwd, command: server?.command });
      toast.success("Restarted");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <StatusDot status={server?.status} />
            {server ? STATUS_LABEL[server.status] ?? server.status : "No server started"}
            {server?.pid && <span className="text-muted-foreground">· pid {server.pid}</span>}
            {server?.exitCode != null && server.status === "exited" && (
              <span className="text-muted-foreground">· code {server.exitCode}</span>
            )}
          </div>
          {server && (
            <div
              className="mt-1 truncate text-xs font-mono text-muted-foreground"
              title={`${server.command} @ ${server.cwd}`}
            >
              {server.command} <span className="opacity-60">@ {server.cwd}</span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {running ? (
            <Button variant="destructive" size="xs" onClick={stop} disabled={busy}>
              <Square className="size-3.5" /> Stop
            </Button>
          ) : (
            server && (
              <Button variant="outline" size="xs" onClick={restart} disabled={busy}>
                <RotateCw className="size-3.5" /> Restart
              </Button>
            )
          )}
        </div>
      </div>

      <div className="relative flex-1 min-h-[300px]">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="absolute inset-0 overflow-y-auto custom-scroll rounded-lg border border-border bg-[var(--terminal)] p-3.5 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words"
        >
          {logs.length === 0 ? (
            <span className="text-muted-foreground">
              No output yet. Start the dev server to see logs here.
            </span>
          ) : (
            logs.map((l, i) => (
              <div
                key={i}
                className={cn(
                  l.stream === "stderr" && "text-[var(--destructive)]",
                  l.stream === "system" && "text-[var(--warning)]",
                  l.stream === "stdout" && "text-foreground/80",
                )}
              >
                {stripAnsi(l.text).replace(/\n$/, "")}
              </div>
            ))
          )}
        </div>
        {!autoScroll && (
          <Button
            size="xs"
            variant="secondary"
            className="absolute bottom-3 right-3 shadow-lg"
            onClick={() => {
              setAutoScroll(true);
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }}
          >
            <ArrowDown className="size-3.5" /> Jump to latest
          </Button>
        )}
      </div>
    </div>
  );
}
