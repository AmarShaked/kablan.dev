import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Check,
  GitBranchPlus,
  Copy,
  ExternalLink,
  FileDiff,
  FileKey2,
  GitBranch,
  Loader2,
  Pencil,
  Play,
  Square,
  SquareTerminal,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import GitOperations from '@/components/tasks/Toolbar/GitOperations';
import { CreateAttemptDialog } from '@/components/dialogs/tasks/CreateAttemptDialog';
import { EditBranchNameDialog } from '@/components/dialogs/tasks/EditBranchNameDialog';
import { ScriptFixerDialog } from '@/components/dialogs/scripts/ScriptFixerDialog';
import { IconAction } from '@/components/ui/icon-action';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useProject } from '@/contexts/ProjectContext';
import { useAttemptExecution, useBranchStatus } from '@/hooks';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useDevServer } from '@/hooks/useDevServer';
import { useDevserverUrlFromLogs } from '@/hooks/useDevserverUrl';
import { useHasDevServerScript } from '@/hooks/useHasDevServerScript';
import { useLogStream } from '@/hooks/useLogStream';
import { useOpenInEditor } from '@/hooks/useOpenInEditor';
import { useDiffSummary } from '@/hooks/useDiffSummary';
import { useTaskAttempts } from '@/hooks/useTaskAttempts';
import { openTaskForm } from '@/lib/openTaskForm';
import { paths } from '@/lib/paths';
import { agentLabel } from '@/utils/agentLabels';
import { statusLabels } from '@/utils/statusLabels';
import { TaskStatusControl } from '@/components/tasks/TaskStatusControl';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';

/**
 * The attempt's properties and actions, as a column beside the conversation.
 *
 * Everything here used to be reachable only through a dialog or a second pane you had to switch
 * to — git actions behind the actions menu, the dev server behind the preview pane, the diff
 * totals only visible once you opened the diff. Those entry points were removed rather than
 * duplicated, so each of these lives in exactly one place now.
 */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-ibm-plex-mono px-2 pb-1 pt-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

function Row({
  icon: Icon,
  children,
  onClick,
  title,
  disabled,
}: {
  icon: typeof GitBranch;
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  const content = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </>
  );

  if (!onClick) {
    return (
      <div
        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm"
        title={title}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
    >
      {content}
    </button>
  );
}

interface AttemptDetailsPanelProps {
  attempt: WorkspaceWithSession;
  task: TaskWithAttemptStatus;
  onOpenDiffs: () => void;
  onOpenLogs: () => void;
  onOpenEnv: () => void;
}

export function AttemptDetailsPanel({
  attempt,
  task,
  onOpenDiffs,
  onOpenLogs,
  onOpenEnv,
}: AttemptDetailsPanelProps) {
  const navigate = useNavigate();
  const { project, projectId } = useProject();

  const { data: attempts = [] } = useTaskAttempts(task.id);
  const { isAttemptRunning, stopExecution, isStopping } = useAttemptExecution(
    attempt.id,
    task.id
  );
  const { data: branchStatus, error: branchStatusError } = useBranchStatus(
    attempt.id
  );
  const { repos, selectedRepoId } = useAttemptRepo(attempt.id);
  const openInEditor = useOpenInEditor(attempt.id);
  const { fileCount, added, deleted } = useDiffSummary(attempt.id);
  const { data: projectHasDevScript = false } =
    useHasDevServerScript(projectId);

  const {
    start: startDevServer,
    stop: stopDevServer,
    isStarting: isStartingDevServer,
    isStopping: isStoppingDevServer,
    runningDevServers,
    devServerProcesses,
  } = useDevServer(attempt.id);

  const [copiedPath, setCopiedPath] = useState(false);

  const primaryDevServer = runningDevServers[0];
  const logStream = useLogStream(primaryDevServer?.id ?? '');
  const devServerUrl = useDevserverUrlFromLogs(logStream.logs)?.url;
  const hasRunningDevServer = runningDevServers.length > 0;

  // Attempts come back newest-first from the API; number them the way a person counts them.
  const ordered = useMemo(
    () =>
      [...attempts].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [attempts]
  );
  const attemptNumber = ordered.findIndex((a) => a.id === attempt.id) + 1;

  const targetBranch = branchStatus?.find(
    (r) => r.repo_id === (selectedRepoId ?? repos[0]?.id)
  )?.target_branch_name;

  const handleNewAttempt = () => CreateAttemptDialog.show({ taskId: task.id });

  const handleCreateSubtask = () => {
    if (!projectId || !attempt.branch) return;
    openTaskForm({
      mode: 'subtask',
      projectId,
      parentTaskAttemptId: attempt.id,
      initialBaseBranch: attempt.branch,
    });
  };

  const handleFixDevScript = () => {
    if (repos.length === 0) return;
    ScriptFixerDialog.show({
      scriptType: 'dev_server',
      repos,
      workspaceId: attempt.id,
      sessionId: devServerProcesses[0]?.session_id,
      initialRepoId: repos.length === 1 ? repos[0].id : undefined,
    });
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto border-l border-border bg-background p-2">
      <TooltipProvider delayDuration={200} skipDelayDuration={400}>
        <div className="flex items-center justify-end gap-0.5 border-b border-border px-1 pb-1.5">
          <IconAction
            icon={ExternalLink}
            label="Open in IDE"
            onClick={() => openInEditor()}
          />
          {attempt.container_ref && (
            <IconAction
              icon={copiedPath ? Check : Copy}
              label="Copy worktree path"
              onClick={() => {
                navigator.clipboard.writeText(attempt.container_ref!);
                setCopiedPath(true);
                setTimeout(() => setCopiedPath(false), 1500);
              }}
            />
          )}
          <IconAction
            icon={GitBranchPlus}
            label="Create subtask"
            onClick={handleCreateSubtask}
            disabled={!projectId || !attempt.branch}
          />
        </div>
      </TooltipProvider>

      <SectionLabel>Task</SectionLabel>
      {/* The glyph is the control, exactly as in the board, the list and the sidebar. */}
      <div className="flex items-center gap-2 px-1 py-1 text-sm">
        <TaskStatusControl task={task} />
        <span className="min-w-0 flex-1 truncate">
          {statusLabels[task.status]}
        </span>
      </div>

      <SectionLabel>Attempt</SectionLabel>
      {ordered.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
            >
              <Play className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                Attempt {attemptNumber} of {ordered.length}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[260px]">
            {ordered.map((a, i) => (
              <DropdownMenuItem
                key={a.id}
                onClick={() =>
                  projectId && navigate(paths.attempt(projectId, task.id, a.id))
                }
              >
                <span className="min-w-0 flex-1 truncate">
                  Attempt {i + 1} · {a.branch}
                </span>
                {a.id === attempt.id && (
                  <Check className="ml-2 h-3.5 w-3.5 shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Row icon={Play}>
          Attempt {Math.max(attemptNumber, 1)} of {Math.max(ordered.length, 1)}
        </Row>
      )}

      {attempt.session?.executor && (
        <Row icon={Bot} title="The agent running this attempt">
          {agentLabel(attempt.session.executor)}
        </Row>
      )}

      <div className="flex gap-1 px-2 pt-1">
        {isAttemptRunning ? (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => stopExecution()}
            disabled={isStopping}
          >
            {isStopping ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <Square className="mr-1.5 h-3 w-3" />
            )}
            {isStopping ? 'Stopping…' : 'Stop attempt'}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handleNewAttempt}
          >
            New attempt
          </Button>
        )}
      </div>

      <SectionLabel>Workspace</SectionLabel>
      <Row
        icon={GitBranch}
        title="Task branch — click to rename"
        onClick={() =>
          EditBranchNameDialog.show({
            attemptId: attempt.id,
            currentBranchName: attempt.branch,
          })
        }
      >
        <span className="inline-flex w-full items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate">{attempt.branch}</span>
          <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" />
        </span>
      </Row>
      {targetBranch && (
        <Row icon={GitBranch} title="Base branch">
          <span className="text-muted-foreground">{targetBranch}</span>
        </Row>
      )}
      <Row
        icon={FileKey2}
        title="Edit this worktree's .env files"
        onClick={onOpenEnv}
      >
        Environment files
      </Row>

      <SectionLabel>Dev server</SectionLabel>
      {hasRunningDevServer ? (
        <>
          {devServerUrl ? (
            <button
              type="button"
              onClick={() =>
                window.open(devServerUrl, '_blank', 'noopener,noreferrer')
              }
              title={devServerUrl}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-accent"
            >
              <SquareTerminal className="h-3.5 w-3.5 shrink-0 text-success" />
              <span className="font-ibm-plex-mono min-w-0 flex-1 truncate text-xs">
                {devServerUrl}
              </span>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
          ) : (
            <Row icon={SquareTerminal}>
              <span className="text-muted-foreground">
                Running — waiting for a URL…
              </span>
            </Row>
          )}
        </>
      ) : (
        <Row icon={SquareTerminal}>
          <span className="text-muted-foreground">
            {projectHasDevScript ? 'Not running' : 'No dev script configured'}
          </span>
        </Row>
      )}
      <div className="flex gap-1 px-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={
            isStartingDevServer ||
            isStoppingDevServer ||
            (!hasRunningDevServer && !projectHasDevScript)
          }
          onClick={() =>
            hasRunningDevServer ? stopDevServer() : startDevServer()
          }
        >
          {isStartingDevServer || isStoppingDevServer ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : hasRunningDevServer ? (
            <Square className="mr-1.5 h-3 w-3" />
          ) : (
            <Play className="mr-1.5 h-3 w-3" />
          )}
          {hasRunningDevServer ? 'Stop dev' : 'Start dev'}
        </Button>
        {devServerProcesses.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onOpenLogs}
          >
            Dev logs
          </Button>
        )}
        {devServerProcesses.length === 0 && !projectHasDevScript && project && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handleFixDevScript}
            disabled={repos.length === 0}
          >
            Fix script
          </Button>
        )}
      </div>

      <SectionLabel>Changes</SectionLabel>
      <button
        type="button"
        onClick={onOpenDiffs}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
      >
        <FileDiff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">
          {fileCount === 0
            ? 'No changes yet'
            : `Diffs · ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`}
        </span>
        {fileCount > 0 && (
          <span className="font-ibm-plex-mono shrink-0 text-xs tabular-nums">
            <span className="text-success">+{added}</span>{' '}
            <span className="text-destructive">−{deleted}</span>
          </span>
        )}
      </button>

      <SectionLabel>Git</SectionLabel>
      <div className="px-2">
        <GitOperations
          selectedAttempt={attempt}
          task={task}
          branchStatus={branchStatus ?? null}
          branchStatusError={branchStatusError}
          isAttemptRunning={isAttemptRunning}
          selectedBranch={targetBranch ?? null}
          layout="vertical"
        />
      </div>
    </div>
  );
}
