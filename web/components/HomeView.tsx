import type { AgentStatus, RunningServer, LogLine } from "../api.ts";
import { AgentDot } from "./AgentDot.tsx";
import { parseBranchKey } from "../lib/agentKey.ts";
import { findServerUrl } from "../lib/serverUrl.ts";

export interface HomeViewProps {
  /** Every agent key's current status, across all projects — `useAgentStream().snapshotStatuses()`
   * re-scanned by the caller on its `version` counter so this stays live. */
  statuses: Record<string, AgentStatus>;
  /** Running (or not) dev servers, keyed by working-copy cwd — `App`'s WS-fed `servers` state. */
  servers: Record<string, RunningServer>;
  /** Dev-server output per working-copy cwd, used to sniff out the localhost URL a server printed
   * (same heuristic the Cockpit's Dev-server card uses) — `App`'s WS-fed `logs` state. */
  logs: Record<string, LogLine[]>;
  onOpenBranch: (project: string, branch: string) => void;
  onOpenProject: (project: string) => void;
  /** Opens the "New session" dialog (branch off a base branch without picking an existing one
   * first) — omitted entirely (button hidden) when no project is selected yet. */
  onNewSession?: () => void;
}

const ACTIVE_STATUSES = new Set<AgentStatus>(["working", "awaitingInput"]);
const RUNNING_STATUSES = new Set<RunningServer["status"]>(["running", "starting"]);

function basename(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

/**
 * Cross-project "what's live right now" board — the Home rail item's destination. Two
 * sections: agents currently working/awaiting input, and dev servers currently running, each
 * across every project (not just the selected one). Clicking a row jumps straight to that
 * branch's cockpit (agents) or at least selects the project (servers — branch resolution from a
 * cwd cross-project is a v1 best-effort left to the caller).
 */
export function HomeView({ statuses, servers, logs, onOpenBranch, onOpenProject, onNewSession }: HomeViewProps) {
  const agentRows = Object.entries(statuses)
    .map(([key, status]) => ({ key, status, parsed: parseBranchKey(key) }))
    .filter(
      (r): r is { key: string; status: AgentStatus; parsed: { project: string; branch: string } } =>
        r.parsed !== null && ACTIVE_STATUSES.has(r.status),
    );

  const serverRows = Object.values(servers).filter((s) => RUNNING_STATUSES.has(s.status));

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Home</h1>
        <span className="text-sm text-muted-foreground">— what's live right now</span>
        {onNewSession && (
          <button
            type="button"
            onClick={onNewSession}
            className="ml-auto rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            New session
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto custom-scroll p-6">
        <section>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span>Agents working now</span>
            <span>{agentRows.length}</span>
          </div>
          {agentRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing running.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {agentRows.map(({ key, status, parsed }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onOpenBranch(parsed.project, parsed.branch)}
                  className="flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <AgentDot status={status} />
                  <span className="truncate">{parsed.project}</span>
                  <span className="text-muted-foreground">›</span>
                  <span className="truncate font-mono text-xs">{parsed.branch}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{status}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span>Dev servers running now</span>
            <span>{serverRows.length}</span>
          </div>
          {serverRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dev servers running.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {serverRows.map((s) => {
                const url = findServerUrl(logs[s.cwd] ?? []);
                return (
                  <div
                    key={s.cwd}
                    data-testid={`server-row-${s.projectName}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenProject(s.projectName)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onOpenProject(s.projectName);
                    }}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                  >
                    <span className="inline-block size-2 shrink-0 rounded-full bg-emerald-500" />
                    <span className="truncate">{s.projectName}</span>
                    <span className="text-muted-foreground">›</span>
                    <span className="truncate font-mono text-xs">{basename(s.cwd)}</span>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-auto truncate text-xs text-sky-500 hover:underline"
                      >
                        {url}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
