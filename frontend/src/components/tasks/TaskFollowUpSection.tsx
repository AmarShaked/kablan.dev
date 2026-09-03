import {
  Loader2,
  ArrowUp,
  CornerDownLeft,
  StopCircle,
  AlertCircle,
  Clock,
  X,
  Gauge,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
//
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ScratchType, type TaskWithAttemptStatus } from 'shared/types';
import { useBranchStatus } from '@/hooks';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { cn } from '@/lib/utils';
//
import { useReview } from '@/contexts/ReviewProvider';
import { useClickedElements } from '@/contexts/ClickedElementsProvider';
import { useEntries } from '@/contexts/EntriesContext';
import { ContextMeter, contextIsHeavy } from '@/components/tasks/ContextMeter';
import { useKeySubmitFollowUp, Scope } from '@/keyboard';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { useProject } from '@/contexts/ProjectContext';
import { useProjectTags } from '@/hooks/useProjectTags';
//
import { ComposerMenu } from '@/components/tasks/ComposerMenu';
import { useAttemptBranch } from '@/hooks/useAttemptBranch';
import { FollowUpConflictSection } from '@/components/tasks/follow-up/FollowUpConflictSection';
import { ClickedElementsBanner } from '@/components/tasks/ClickedElementsBanner';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { useRetryUi } from '@/contexts/RetryUiContext';
import { useFollowUpSend } from '@/hooks/useFollowUpSend';
import { useVariant } from '@/hooks/useVariant';
import type {
  DraftFollowUpData,
  ExecutorProfileId,
  QueueStatus,
} from 'shared/types';
import { getLatestProfileFromProcesses } from '@/utils/executor';
import { buildResolveConflictsInstructions } from '@/lib/conflicts';
import { useTranslation } from 'react-i18next';
import { useScratch } from '@/hooks/useScratch';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queueApi } from '@/lib/api';
import { imagesApi } from '@/lib/api';
import type { Session } from 'shared/types';
import { buildAgentPrompt } from '@/utils/promptMessage';

interface TaskFollowUpSectionProps {
  task: TaskWithAttemptStatus;
  session?: Session;
}

export function TaskFollowUpSection({
  task,
  session,
}: TaskFollowUpSectionProps) {
  const { t } = useTranslation('tasks');
  const { projectId } = useProject();

  // Derive IDs from session
  const workspaceId = session?.workspace_id;
  const sessionId = session?.id;

  const { isAttemptRunning, stopExecution, isStopping, processes } =
    useAttemptExecution(workspaceId, task.id);

  const { data: branchStatus, refetch: refetchBranchStatus } =
    useBranchStatus(workspaceId);
  const { repos } = useAttemptRepo(workspaceId);

  const repoWithConflicts = useMemo(
    () =>
      branchStatus?.find(
        (r) => r.is_rebase_in_progress || (r.conflicted_files?.length ?? 0) > 0
      ),
    [branchStatus]
  );
  const { branch: attemptBranch, refetch: refetchAttemptBranch } =
    useAttemptBranch(workspaceId);
  const { profiles } = useUserSystem();
  const { comments, generateReviewMarkdown, clearComments } = useReview();
  const {
    generateMarkdown: generateClickedMarkdown,
    clearElements: clearClickedElements,
  } = useClickedElements();
  const { enableScope, disableScope } = useHotkeysContext();

  const reviewMarkdown = useMemo(
    () => generateReviewMarkdown(),
    [generateReviewMarkdown]
  );

  const clickedMarkdown = useMemo(
    () => generateClickedMarkdown(),
    [generateClickedMarkdown]
  );

  // Non-editable conflict resolution instructions (derived, like review comments)
  const conflictResolutionInstructions = useMemo(() => {
    if (!repoWithConflicts?.conflicted_files?.length) return null;
    return buildResolveConflictsInstructions(
      attemptBranch,
      repoWithConflicts.target_branch_name,
      repoWithConflicts.conflicted_files,
      repoWithConflicts.conflict_op ?? null,
      repoWithConflicts.repo_name
    );
  }, [attemptBranch, repoWithConflicts]);

  // Editor state (persisted via scratch)
  const {
    scratch,
    updateScratch,
    isLoading: isScratchLoading,
  } = useScratch(ScratchType.DRAFT_FOLLOW_UP, sessionId ?? '');

  // Derive the message and variant from scratch
  const scratchData: DraftFollowUpData | undefined =
    scratch?.payload?.type === 'DRAFT_FOLLOW_UP'
      ? scratch.payload.data
      : undefined;

  // Track whether the follow-up textarea is focused
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);

  // Local message state for immediate UI feedback (before debounced save)
  const [localMessage, setLocalMessage] = useState('');

  // Variant selection - derive default from latest process
  const latestProfileId = useMemo(
    () => getLatestProfileFromProcesses(processes),
    [processes]
  );

  const currentProfile = useMemo(() => {
    if (!latestProfileId) return null;
    return profiles?.[latestProfileId.executor] ?? null;
  }, [latestProfileId, profiles]);

  // Variant selection with priority: user selection > scratch > process
  const { selectedVariant, setSelectedVariant: setVariantFromHook } =
    useVariant({
      processVariant: latestProfileId?.variant ?? null,
      scratchVariant: scratchData?.executor_profile_id?.variant,
    });

  // Ref to track current variant for use in message save callback
  const variantRef = useRef<string | null>(selectedVariant);
  useEffect(() => {
    variantRef.current = selectedVariant;
  }, [selectedVariant]);

  // Refs to stabilize callbacks - avoid re-creating callbacks when these values change
  const scratchRef = useRef(scratch);
  useEffect(() => {
    scratchRef.current = scratch;
  }, [scratch]);

  // Save scratch helper (used for both message and variant changes)
  // Uses scratchRef to avoid callback invalidation when scratch updates
  const saveToScratch = useCallback(
    async (message: string, variant: string | null) => {
      if (!workspaceId || !latestProfileId?.executor) return;
      // Don't create empty scratch entries - only save if there's actual content,
      // a variant is selected, or scratch already exists (to allow clearing a draft)
      if (!message.trim() && !variant && !scratchRef.current) return;
      try {
        await updateScratch({
          payload: {
            type: 'DRAFT_FOLLOW_UP',
            data: {
              message,
              executor_profile_id: {
                executor: latestProfileId.executor,
                variant,
              },
            },
          },
        });
      } catch (e) {
        console.error('Failed to save follow-up draft', e);
      }
    },
    [workspaceId, updateScratch, latestProfileId?.executor]
  );

  // Wrapper to update variant and save to scratch immediately
  const setSelectedVariant = useCallback(
    (variant: string | null) => {
      setVariantFromHook(variant);
      // Save immediately when user changes variant
      saveToScratch(localMessage, variant);
    },
    [setVariantFromHook, saveToScratch, localMessage]
  );

  // Debounced save for message changes (uses current variant from ref)
  const { debounced: setFollowUpMessage, cancel: cancelDebouncedSave } =
    useDebouncedCallback(
      useCallback(
        (value: string) => saveToScratch(value, variantRef.current),
        [saveToScratch]
      ),
      500
    );

  // Sync local message from scratch when it loads (but not while user is typing)
  useEffect(() => {
    if (isScratchLoading) return;
    if (isTextareaFocused) return; // Don't overwrite while user is typing
    setLocalMessage(scratchData?.message ?? '');
  }, [isScratchLoading, scratchData?.message, isTextareaFocused]);

  // During retry, follow-up box is greyed/disabled (not hidden)
  // Use RetryUi context so optimistic retry immediately disables this box
  const { activeRetryProcessId } = useRetryUi();
  const isRetryActive = !!activeRetryProcessId;

  // Queue status for queuing follow-up messages while agent is running
  const queryClient = useQueryClient();
  const QUEUE_STATUS_KEY = 'queue-status';

  const {
    data: queueStatus = { status: 'empty' as const },
    refetch: refreshQueueStatus,
  } = useQuery<QueueStatus>({
    queryKey: [QUEUE_STATUS_KEY, sessionId],
    queryFn: () => queueApi.getStatus(sessionId!),
    enabled: !!sessionId,
  });

  const isQueued = queueStatus.status === 'queued';
  const queuedMessage = isQueued
    ? (queueStatus as Extract<QueueStatus, { status: 'queued' }>).message
    : null;

  const queueMutation = useMutation({
    mutationFn: ({
      message,
      executor_profile_id,
    }: {
      message: string;
      executor_profile_id: ExecutorProfileId;
    }) => queueApi.queue(sessionId!, { message, executor_profile_id }),
    onSuccess: (status) => {
      queryClient.setQueryData([QUEUE_STATUS_KEY, sessionId], status);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => queueApi.cancel(sessionId!),
    onSuccess: (status) => {
      queryClient.setQueryData([QUEUE_STATUS_KEY, sessionId], status);
    },
  });

  const queueMessage = useCallback(
    async (message: string, executorProfileId: ExecutorProfileId) => {
      if (!sessionId) return;
      await queueMutation.mutateAsync({
        message,
        executor_profile_id: executorProfileId,
      });
    },
    [sessionId, queueMutation]
  );

  const cancelQueue = useCallback(async () => {
    if (!sessionId) return;
    await cancelMutation.mutateAsync();
  }, [sessionId, cancelMutation]);

  const isQueueLoading = queueMutation.isPending || cancelMutation.isPending;

  // Track previous process count to detect new processes
  const prevProcessCountRef = useRef(processes.length);

  // Refresh queue status when execution stops OR when a new process starts
  useEffect(() => {
    const prevCount = prevProcessCountRef.current;
    prevProcessCountRef.current = processes.length;

    if (!workspaceId) return;

    // Refresh when execution stops
    if (!isAttemptRunning) {
      refreshQueueStatus();
      return;
    }

    // Refresh when a new process starts (could be queued message consumption or follow-up)
    if (processes.length > prevCount) {
      refreshQueueStatus();
      // Re-sync local message from current scratch state
      // If scratch was deleted, scratchData will be undefined, so localMessage becomes ''
      setLocalMessage(scratchData?.message ?? '');
    }
  }, [
    isAttemptRunning,
    workspaceId,
    processes.length,
    refreshQueueStatus,
    scratchData?.message,
  ]);

  // When queued, display the queued message content so user can edit it
  const displayMessage =
    isQueued && queuedMessage ? queuedMessage.data.message : localMessage;

  // Check if there's a pending approval - users shouldn't be able to type during approvals
  const { entries, tokenUsageInfo } = useEntries();
  const hasPendingApproval = useMemo(() => {
    return entries.some((entry) => {
      if (entry?.type !== 'NORMALIZED_ENTRY') return false;
      // Optional at every hop, because this runs against whatever the conversation stream has
      // produced so far. An entry that arrives without an `entry_type` — a partial frame, or a
      // shape written by an older version — used to throw here during render, and a throw in
      // render is the whole app: the composer, the conversation and the board all went white.
      // Whether one entry is awaiting approval is not worth that.
      const entryType = entry.content?.entry_type;
      return (
        entryType?.type === 'tool_use' &&
        entryType.status?.status === 'pending_approval'
      );
    });
  }, [entries]);

  // Send follow-up action
  const { isSendingFollowUp, followUpError, setFollowUpError, onSendFollowUp } =
    useFollowUpSend({
      sessionId,
      message: localMessage,
      conflictMarkdown: conflictResolutionInstructions,
      reviewMarkdown,
      clickedMarkdown,
      executor: latestProfileId?.executor ?? null,
      variant: selectedVariant,
      clearComments,
      clearClickedElements,
      onAfterSendCleanup: () => {
        cancelDebouncedSave(); // Cancel any pending debounced save to avoid race condition
        setLocalMessage(''); // Clear local state immediately
        // Scratch deletion is handled by the backend when the queued message is consumed
      },
    });

  // Separate logic for when textarea should be disabled vs when send button should be disabled
  const canTypeFollowUp = useMemo(() => {
    if (!workspaceId || processes.length === 0 || isSendingFollowUp) {
      return false;
    }

    if (isRetryActive) return false; // disable typing while retry editor is active
    if (hasPendingApproval) return false; // disable typing during approval
    // Note: isQueued no longer blocks typing - editing auto-cancels the queue
    return true;
  }, [
    workspaceId,
    processes.length,
    isSendingFollowUp,
    isRetryActive,
    hasPendingApproval,
  ]);

  const canSendFollowUp = useMemo(() => {
    if (!canTypeFollowUp || !latestProfileId?.executor) {
      return false;
    }

    // Allow sending if conflict instructions, review comments, clicked elements, or message is present
    return Boolean(
      conflictResolutionInstructions ||
        reviewMarkdown ||
        clickedMarkdown ||
        localMessage.trim()
    );
  }, [
    canTypeFollowUp,
    latestProfileId?.executor,
    conflictResolutionInstructions,
    reviewMarkdown,
    clickedMarkdown,
    localMessage,
  ]);
  const isEditable = !isRetryActive && !hasPendingApproval;

  // Handler to queue the current message for execution after agent finishes
  const handleQueueMessage = useCallback(async () => {
    if (
      !localMessage.trim() &&
      !conflictResolutionInstructions &&
      !reviewMarkdown &&
      !clickedMarkdown
    ) {
      return;
    }

    // Cancel any pending debounced save and save immediately before queueing
    // This prevents the race condition where the debounce fires after queueing
    cancelDebouncedSave();
    await saveToScratch(localMessage, selectedVariant);

    // Combine all the content that would be sent (same as follow-up send)
    const { prompt } = buildAgentPrompt(
      localMessage,
      [conflictResolutionInstructions, clickedMarkdown, reviewMarkdown].filter(
        Boolean
      )
    );
    if (latestProfileId) {
      await queueMessage(prompt, {
        executor: latestProfileId.executor,
        variant: selectedVariant,
      });
    }
  }, [
    localMessage,
    conflictResolutionInstructions,
    reviewMarkdown,
    clickedMarkdown,
    latestProfileId,
    selectedVariant,
    queueMessage,
    cancelDebouncedSave,
    saveToScratch,
  ]);

  // Keyboard shortcut handler - send follow-up or queue depending on state
  const handleSubmitShortcut = useCallback(
    (e?: KeyboardEvent) => {
      e?.preventDefault();
      if (isAttemptRunning) {
        // When running, CMD+Enter queues the message (if not already queued)
        if (!isQueued) {
          handleQueueMessage();
        }
      } else {
        onSendFollowUp();
      }
    },
    [isAttemptRunning, isQueued, handleQueueMessage, onSendFollowUp]
  );

  // Ref to access setFollowUpMessage without adding it as a dependency
  const setFollowUpMessageRef = useRef(setFollowUpMessage);
  useEffect(() => {
    setFollowUpMessageRef.current = setFollowUpMessage;
  }, [setFollowUpMessage]);

  // Ref for followUpError to use in stable onChange handler
  const followUpErrorRef = useRef(followUpError);
  useEffect(() => {
    followUpErrorRef.current = followUpError;
  }, [followUpError]);

  // Helper to get current queue state from cache (avoids ref-sync pattern)
  const getQueueState = useCallback(() => {
    const status = queryClient.getQueryData<QueueStatus>([
      QUEUE_STATUS_KEY,
      sessionId,
    ]);
    const queued = status?.status === 'queued';
    const message = queued
      ? (status as Extract<QueueStatus, { status: 'queued' }>).message
      : null;
    return { isQueued: queued, queuedMessage: message };
  }, [queryClient, sessionId]);

  // Handle image paste - upload to container and insert markdown
  const handlePasteFiles = useCallback(
    async (files: File[]) => {
      if (!workspaceId) return;

      for (const file of files) {
        try {
          const response = await imagesApi.uploadForAttempt(workspaceId, file);
          // Append markdown image to current message
          const imageMarkdown = `![${response.original_name}](${response.file_path})`;

          // If queued, cancel queue and use queued message as base (same as editor change behavior)
          const {
            isQueued: currentlyQueued,
            queuedMessage: currentQueuedMessage,
          } = getQueueState();
          if (currentlyQueued && currentQueuedMessage) {
            cancelMutation.mutate();
            const base = currentQueuedMessage.data.message;
            const newMessage = base
              ? `${base}\n\n${imageMarkdown}`
              : imageMarkdown;
            setLocalMessage(newMessage);
            setFollowUpMessageRef.current(newMessage);
          } else {
            setLocalMessage((prev) => {
              const newMessage = prev
                ? `${prev}\n\n${imageMarkdown}`
                : imageMarkdown;
              setFollowUpMessageRef.current(newMessage); // Debounced save to scratch
              return newMessage;
            });
          }
        } catch (error) {
          console.error('Failed to upload image:', error);
        }
      }
    },
    [workspaceId, getQueueState, cancelMutation]
  );

  // Attachment button - file input ref and handlers
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter((f) =>
        f.type.startsWith('image/')
      );
      if (files.length > 0) {
        handlePasteFiles(files);
      }
      // Reset input so same file can be selected again
      e.target.value = '';
    },
    [handlePasteFiles]
  );

  // Handler for PR comments insertion

  const { data: tags = [] } = useProjectTags(projectId);

  // Appended rather than substituted: a saved prompt is usually the frame for something you are
  // about to add to, and silently discarding what is already typed would be the one unrecoverable
  // thing this menu could do.
  const handleInsertPrompt = useCallback(
    (text: string) => {
      const next = localMessage.trim()
        ? `${localMessage.trimEnd()}\n\n${text}`
        : text;
      setLocalMessage(next);
      setFollowUpMessageRef.current(next);
    },
    [localMessage]
  );

  // Stable onChange handler for WYSIWYGEditor
  const handleEditorChange = useCallback(
    (value: string) => {
      // Auto-cancel queue when user starts editing
      const { isQueued: currentlyQueued } = getQueueState();
      if (currentlyQueued) {
        cancelMutation.mutate();
      }
      setLocalMessage(value); // Immediate update for UI responsiveness
      setFollowUpMessageRef.current(value); // Debounced save to scratch
      if (followUpErrorRef.current) setFollowUpError(null);
    },
    [setFollowUpError, getQueueState, cancelMutation]
  );

  // Memoize placeholder to avoid re-renders
  const hasExtraContext = !!(reviewMarkdown || conflictResolutionInstructions);
  const editorPlaceholder = useMemo(
    () =>
      hasExtraContext
        ? '(Optional) Add additional instructions... Type @ to insert tags or search files.'
        : 'Continue working on this task attempt... Type @ to insert tags or search files.',
    [hasExtraContext]
  );

  // Register keyboard shortcuts
  useKeySubmitFollowUp(handleSubmitShortcut, {
    scope: Scope.FOLLOW_UP_READY,
    enableOnFormTags: ['textarea', 'TEXTAREA'],
    when: canSendFollowUp && isEditable,
  });

  // Enable FOLLOW_UP scope when textarea is focused AND editable
  useEffect(() => {
    if (isEditable && isTextareaFocused) {
      enableScope(Scope.FOLLOW_UP);
    } else {
      disableScope(Scope.FOLLOW_UP);
    }
    return () => {
      disableScope(Scope.FOLLOW_UP);
    };
  }, [isEditable, isTextareaFocused, enableScope, disableScope]);

  // Enable FOLLOW_UP_READY scope when ready to send
  useEffect(() => {
    const isReady = isTextareaFocused && isEditable;

    if (isReady) {
      enableScope(Scope.FOLLOW_UP_READY);
    } else {
      disableScope(Scope.FOLLOW_UP_READY);
    }
    return () => {
      disableScope(Scope.FOLLOW_UP_READY);
    };
  }, [isTextareaFocused, isEditable, enableScope, disableScope]);

  // When a process completes (e.g., agent resolved conflicts), refresh branch status promptly
  const prevRunningRef = useRef<boolean>(isAttemptRunning);
  useEffect(() => {
    if (prevRunningRef.current && !isAttemptRunning && workspaceId) {
      refetchBranchStatus();
      refetchAttemptBranch();
    }
    prevRunningRef.current = isAttemptRunning;
  }, [
    isAttemptRunning,
    workspaceId,
    refetchBranchStatus,
    refetchAttemptBranch,
  ]);

  if (!workspaceId) return null;

  if (isScratchLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden',
        isRetryActive && 'opacity-50'
      )}
    >
      {/* Scrollable content area */}
      <div className="overflow-y-auto min-h-0 p-4">
        <div className="space-y-2">
          {followUpError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{followUpError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            {/* Review comments preview */}
            {reviewMarkdown && (
              <div className="mb-4">
                <div className="text-sm whitespace-pre-wrap break-words rounded-md border bg-muted p-3">
                  {reviewMarkdown}
                </div>
              </div>
            )}

            {/* Conflict notice and actions (optional UI) */}
            {branchStatus && (
              <FollowUpConflictSection
                workspaceId={workspaceId}
                attemptBranch={attemptBranch}
                branchStatus={branchStatus}
                isEditable={isEditable}
                onResolve={onSendFollowUp}
                enableResolve={
                  canSendFollowUp && !isAttemptRunning && isEditable
                }
                enableAbort={canSendFollowUp && !isAttemptRunning}
                conflictResolutionInstructions={conflictResolutionInstructions}
              />
            )}

            {/* Clicked elements notice and actions */}
            <ClickedElementsBanner />

            {/* Queued message indicator */}
            {isQueued && queuedMessage && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-md border">
                <Clock className="h-4 w-4 flex-shrink-0" />
                <div className="font-medium">
                  {t(
                    'followUp.queuedMessage',
                    'Message queued - will execute when current run finishes'
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The composer, as one capsule.
          The primary control on the right is a single button whose job changes with the state,
          rather than a row that reflows every time the agent starts or stops:
            idle            → Send
            running, text   → Queue (this message runs when the current one finishes)
            running, empty  → Stop (there is nothing to queue, so the useful act is to interrupt)
          Cancel-queue takes the slot once something is queued, since that is the only thing you
          can usefully do to a queued message from here. */}
      <div className="p-3">
        {/* The one place the context size is worth interrupting for: right where you are about
            to spend it. Above the threshold, sending costs several times what the same message
            costs on a fresh session, and the only thing that changes that is clearing. */}
        {contextIsHeavy(tokenUsageInfo) && !isQueued && (
          <div className="mb-2 flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span className="min-w-0 flex-1">
              This task is carrying{' '}
              <span className="font-medium tabular-nums">
                {tokenUsageInfo!.total_tokens.toLocaleString()}
              </span>{' '}
              tokens of context. Every further turn pays for all of it.
            </span>
            <button
              type="button"
              onClick={() => onSendFollowUp({ clearContext: true })}
              disabled={!canSendFollowUp || isSendingFollowUp}
              title="Send this message on a fresh conversation. Your branch, worktree and changes stay; the agent forgets what was said."
              className="shrink-0 rounded-md border border-warning/50 px-2 py-0.5 font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-50"
            >
              Send cleared
            </button>
          </div>
        )}
        <div
          className={cn(
            'rounded-3xl border border-input bg-background px-4 py-3 transition-shadow',
            'group-data-[scrolled=true]/composer:shadow-lg',
            isTextareaFocused && 'border-ring'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          <div
            className="flex flex-col gap-2"
            onFocus={() => setIsTextareaFocused(true)}
            onBlur={(e) => {
              // Only blur if focus is leaving the container entirely
              if (!e.currentTarget.contains(e.relatedTarget)) {
                setIsTextareaFocused(false);
              }
            }}
          >
            <WYSIWYGEditor
              placeholder={editorPlaceholder}
              value={displayMessage}
              onChange={handleEditorChange}
              disabled={!isEditable}
              onPasteFiles={handlePasteFiles}
              repoIds={repos.map((r) => r.id)}
              projectId={projectId}
              executor={latestProfileId?.executor ?? null}
              taskAttemptId={workspaceId}
              onCmdEnter={handleSubmitShortcut}
              className="min-h-[40px]"
            />
          </div>

          <div className="flex items-center gap-2 pt-3">
            <ComposerMenu
              onUpload={handleAttachClick}
              tags={tags}
              onInsertPrompt={handleInsertPrompt}
              currentProfile={currentProfile}
              selectedVariant={selectedVariant}
              onVariantChange={setSelectedVariant}
              disabled={!isEditable}
            />

            {/* Always visible, beside the controls: the context is what the next turn costs, so it
                belongs on the row you are about to press send on. */}
            <ContextMeter info={tokenUsageInfo} variant="row" />

            <div className="min-w-0 flex-1" />

            {comments.length > 0 && (
              <Button
                onClick={clearComments}
                size="sm"
                variant="ghost"
                className="h-8 shrink-0 rounded-full text-xs text-destructive"
                disabled={!isEditable}
              >
                {t('followUp.clearReviewComments')}
              </Button>
            )}

            {(() => {
              const busy = isQueueLoading || isStopping || isSendingFollowUp;
              const hasText = Boolean(
                localMessage.trim() ||
                  conflictResolutionInstructions ||
                  reviewMarkdown ||
                  clickedMarkdown
              );

              const action = !isAttemptRunning
                ? {
                    onClick: () => onSendFollowUp(),
                    disabled: !canSendFollowUp || !isEditable,
                    label: conflictResolutionInstructions
                      ? t('followUp.resolveConflicts')
                      : t('followUp.send'),
                    icon: <ArrowUp className="h-4 w-4" />,
                    destructive: false,
                  }
                : isQueued
                  ? {
                      onClick: cancelQueue,
                      disabled: isQueueLoading,
                      label: t('followUp.cancelQueue', 'Cancel Queue'),
                      icon: <X className="h-4 w-4" />,
                      destructive: false,
                    }
                  : hasText
                    ? {
                        onClick: handleQueueMessage,
                        disabled: isQueueLoading,
                        label: t('followUp.queue', 'Queue'),
                        icon: <CornerDownLeft className="h-4 w-4" />,
                        destructive: false,
                      }
                    : {
                        onClick: stopExecution,
                        disabled: isStopping,
                        label: t('followUp.stop'),
                        icon: <StopCircle className="h-4 w-4" />,
                        destructive: true,
                      };

              return (
                <Button
                  onClick={action.onClick}
                  disabled={action.disabled || busy}
                  variant={action.destructive ? 'destructive' : 'default'}
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-full"
                  title={action.label}
                  aria-label={action.label}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    action.icon
                  )}
                </Button>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
