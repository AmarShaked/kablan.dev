import { useState } from 'react';
import {
  Bot,
  Check,
  CircleDot,
  GitBranchPlus,
  Copy,
  ExternalLink,
  FileDiff,
  FileKey2,
  GitBranch,
  Loader2,
  Play,
  Square,
  SquareTerminal,
  Wrench,
} from 'lucide-react';

import { BranchStatusChips } from '@/components/tasks/Toolbar/BranchStatus';
import {
  BaseBranchField,
  BranchNameField,
} from '@/components/panels/BranchFields';
import GitOperations from '@/components/tasks/Toolbar/GitOperations';
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
import { openTaskForm } from '@/lib/openTaskForm';
import { cn } from '@/lib/utils';
import { agentLabel } from '@/utils/agentLabels';
import { statusLabels } from '@/utils/statusLabels';
import { TaskStatusControl } from '@/components/tasks/TaskStatusControl';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';

/**
 * The task's branch, worktree and git state, as a column beside the conversation.
 *
 * Everything here used to be reachable only through a dialog or a second pane you had to switch
 * to — git actions behind the actions menu, the dev server behind the preview pane, the diff
 * totals only visible once you opened the diff. Those entry points were removed rather than
 * duplicated, so each of these lives in exactly one place now.
 */

/**
 * One property: its name on the left, its value on the right.
 *
 * The pane used to be section headings over full-width rows, which meant the name of a thing and
 * the thing itself were on different lines and nothing lined up down the column. A fixed label
 * column reads the way a properties list should — you scan the left edge for the field you want,
 * and every value starts on the same axis.
 *
 * Where a property can be changed, the value is the control and the name is not: a row-wide
 * button puts the hit area over the label too, so pointing at the word "Branch" offers to rename
 * it. Every value is set the same way — same size, same colour, same box — so the column reads as
 * one list of values rather than a set of differently-treated fields.
 */

/** The one value style. Shared so a new property cannot arrive with a slightly different one. */
const VALUE =
  'flex min-h-6 min-w-0 flex-1 items-center rounded px-1.5 text-[11px]';

function Property({
  icon: Icon,
  label,
  children,
  onClick,
  title,
  disabled,
}: {
  icon: typeof GitBranch;
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex w-full items-start gap-2 px-2 py-1">
      <span className="flex w-[6.5rem] shrink-0 items-center gap-1.5 pt-1 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          title={title}
          className={cn(
            VALUE,
            '-mr-1.5 text-left transition-colors hover:bg-accent',
            'disabled:pointer-events-none disabled:opacity-50'
          )}
        >
          {children}
        </button>
      ) : (
        <span className={cn(VALUE, '-mr-1.5')} title={title}>
          {children}
        </span>
      )}
    </div>
  );
}

interface AttemptDetailsPanelProps {
  attempt: WorkspaceWithSession;
  task: TaskWithAttemptStatus;
  onOpenDiffs: () => void;
  onOpenEnv: () => void;
}

export function AttemptDetailsPanel({
  attempt,
  task,
  onOpenDiffs,
  onOpenEnv,
}: AttemptDetailsPanelProps) {
  const { project, projectId } = useProject();

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

  const selectedRepoStatus = branchStatus?.find(
    (r) => r.repo_id === (selectedRepoId ?? repos[0]?.id)
  );
  const targetBranch = selectedRepoStatus?.target_branch_name;

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
        <div className="mb-1.5 flex items-center justify-end gap-0.5 border-b border-border px-1 pb-1.5">
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

          {/* Stopping the agent is the one act that belongs up here with the other things you
              do to the task; there is no run to switch to, so nothing sits beside it. */}
          {isAttemptRunning && (
            <IconAction
              icon={Square}
              label={isStopping ? 'Stopping…' : 'Stop'}
              onClick={() => stopExecution()}
              disabled={isStopping}
            />
          )}
        </div>
      </TooltipProvider>

      {/* A badge rather than a line of text: status is the one property whose value is a state
          rather than a name, and the colour it already has everywhere else in the app carries
          that at a glance. The glyph stays inside it — the ring is what says how far along the
          task is, and the pill only supplies the surface. */}
      <div className="flex w-full items-start gap-2 px-2 py-1">
        <span className="flex w-[6.5rem] shrink-0 items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <CircleDot className="h-3.5 w-3.5 shrink-0" />
          Status
        </span>
        <span className="-mr-1.5 flex min-h-6 min-w-0 flex-1 items-center">
          <TaskStatusControl
            task={task}
            size={12}
            className="!inline-flex !min-w-0 !gap-1.5 !rounded-full border border-border !bg-background !py-0.5 !pl-1.5 !pr-2 text-[11px] font-medium transition-colors hover:!bg-accent"
          >
            <span className="min-w-0 truncate">
              {statusLabels[task.status]}
            </span>
          </TaskStatusControl>
        </span>
      </div>

      {attempt.session?.executor && (
        <Property
          icon={Bot}
          label="Agent"
          title="The agent working on this task"
        >
          {agentLabel(attempt.session.executor)}
        </Property>
      )}

      {/* Both branch fields are edited where they are shown, so the value is the control and
          there is no pencil or gear standing in for it. */}
      <Property icon={GitBranch} label="Branch">
        <BranchNameField
          attemptId={attempt.id}
          branch={attempt.branch}
          disabled={isAttemptRunning}
        />
      </Property>

      {targetBranch && (
        <Property icon={GitBranch} label="Base">
          <span className="flex w-full min-w-0 items-center gap-1.5">
            <BaseBranchField
              attemptId={attempt.id}
              repoId={selectedRepoId ?? repos[0]?.id}
              targetBranch={targetBranch}
              disabled={isAttemptRunning}
            />
            {/* How far this branch has drifted from its base belongs beside the base itself,
                not in a separate status strip further down the pane. */}
            <BranchStatusChips
              status={selectedRepoStatus}
              compact
              className="shrink-0"
            />
          </span>
        </Property>
      )}

      <Property
        icon={FileKey2}
        label="Environment"
        title="Edit this worktree's .env files"
        onClick={onOpenEnv}
      >
        Edit .env files
      </Property>

      {/* The controls sit on the row they act on: the pane is a properties list, and a
          full-width button bar under one property reads as if it belonged to all of them. */}
      <Property icon={SquareTerminal} label="Dev server">
        <span className="flex w-full items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate">
            {hasRunningDevServer ? (
              devServerUrl ? (
                <a
                  href={devServerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={devServerUrl}
                  className="hover:underline"
                >
                  {devServerUrl}
                </a>
              ) : (
                <span>Waiting for a URL…</span>
              )
            ) : (
              <span>{projectHasDevScript ? 'Stopped' : 'No dev script'}</span>
            )}
          </span>

          {/* Icons, not labelled buttons: the row is ~140px wide once the label column is
              taken out, and two words of button leave the status itself nothing to sit in. */}
          <TooltipProvider delayDuration={200} skipDelayDuration={400}>
            <span className="flex shrink-0 items-center gap-0.5">
              {devServerProcesses.length === 0 &&
                !projectHasDevScript &&
                project && (
                  <IconAction
                    icon={Wrench}
                    label="Fix dev script"
                    onClick={handleFixDevScript}
                    disabled={repos.length === 0}
                    className="!h-5 !w-5"
                  />
                )}
              <IconAction
                icon={
                  isStartingDevServer || isStoppingDevServer
                    ? Loader2
                    : hasRunningDevServer
                      ? Square
                      : Play
                }
                label={
                  hasRunningDevServer ? 'Stop dev server' : 'Start dev server'
                }
                className={cn(
                  '!h-5 !w-5',
                  (isStartingDevServer || isStoppingDevServer) &&
                    '[&_svg]:animate-spin'
                )}
                disabled={
                  isStartingDevServer ||
                  isStoppingDevServer ||
                  (!hasRunningDevServer && !projectHasDevScript)
                }
                onClick={() =>
                  hasRunningDevServer ? stopDevServer() : startDevServer()
                }
              />
            </span>
          </TooltipProvider>
        </span>
      </Property>

      <Property icon={FileDiff} label="Changes" onClick={onOpenDiffs}>
        <span className="inline-flex w-full items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate">
            {fileCount === 0
              ? 'No changes yet'
              : `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`}
          </span>
          {fileCount > 0 && (
            <span className="font-ibm-plex-mono shrink-0 text-xs tabular-nums">
              <span className="text-success">+{added}</span>{' '}
              <span className="text-destructive">−{deleted}</span>
            </span>
          )}
        </span>
      </Property>

      <div className="mt-2 border-t border-border px-2 pt-2">
        <GitOperations
          selectedAttempt={attempt}
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
