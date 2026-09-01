import { useState } from 'react';
import { Check, Clipboard, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { BaseAgentCapability } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { useRetryUi } from '@/contexts/RetryUiContext';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { RetryEditorInline } from './RetryEditorInline';

const UserMessage = ({
  content,
  executionProcessId,
  taskAttempt,
}: {
  content: string;
  executionProcessId?: string;
  taskAttempt?: WorkspaceWithSession;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const { capabilities } = useUserSystem();
  const { activeRetryProcessId, setActiveRetryProcessId, isProcessGreyed } =
    useRetryUi();
  const { isAttemptRunning } = useAttemptExecution(taskAttempt?.id);

  const canFork = !!(
    taskAttempt?.session?.executor &&
    capabilities?.[taskAttempt.session.executor]?.includes(
      BaseAgentCapability.SESSION_FORK
    )
  );

  const startRetry = () => {
    if (!executionProcessId || !taskAttempt) return;
    setIsEditing(true);
    setActiveRetryProcessId(executionProcessId);
  };

  const onCancelled = () => {
    setIsEditing(false);
    setActiveRetryProcessId(null);
  };

  const showRetryEditor =
    !!executionProcessId &&
    isEditing &&
    activeRetryProcessId === executionProcessId;
  const greyed =
    !!executionProcessId &&
    isProcessGreyed(executionProcessId) &&
    !showRetryEditor;

  // Only show retry button when allowed (has process, can fork, not running)
  const canRetry = executionProcessId && canFork && !isAttemptRunning;

  return (
    <div
      className={`px-4 py-2 ${greyed ? 'pointer-events-none opacity-50' : ''}`}
    >
      {showRetryEditor && taskAttempt ? (
        // Editing needs the full width — a retry editor squeezed into a bubble is unusable.
        <RetryEditorInline
          attempt={taskAttempt}
          executionProcessId={executionProcessId}
          initialContent={content}
          onCancelled={onCancelled}
        />
      ) : (
        // What you said, set apart from what the agent did. Everything else in this transcript
        // is full-width, so a right-aligned bubble is enough on its own to show the shape of a
        // conversation without reading any of it.
        <div className="group flex flex-col items-end">
          <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-2.5 text-sm">
            <WYSIWYGEditor
              value={content}
              disabled
              actionsPlacement="none"
              className="flex flex-col gap-1 whitespace-pre-wrap break-words"
              taskAttemptId={taskAttempt?.id}
            />
          </div>

          {/* Height is reserved rather than conditional, or the transcript would shift under
              the cursor every time a message is hovered. */}
          <div className="mt-2.5 flex h-5 items-center gap-1 pr-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Button
              type="button"
              variant="icon"
              size="icon"
              className="!h-7 !w-7 [&_svg]:!size-3.5"
              aria-label={copied ? 'Copied' : 'Copy as Markdown'}
              title={copied ? 'Copied' : 'Copy as Markdown'}
              onClick={() => {
                navigator.clipboard.writeText(content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? (
                <Check className="text-success" />
              ) : (
                <Clipboard className="text-muted-foreground" />
              )}
            </Button>
            {canRetry && (
              <Button
                type="button"
                variant="icon"
                size="icon"
                className="!h-7 !w-7 [&_svg]:!size-3.5"
                aria-label="Edit"
                title="Edit"
                onClick={startRetry}
              >
                <Pencil className="text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMessage;
