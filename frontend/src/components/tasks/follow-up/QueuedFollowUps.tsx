import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { QueuedMessage } from 'shared/types';
import { Button } from '@/components/ui/button';
import WYSIWYGEditor from '@/components/ui/wysiwyg';

interface QueuedFollowUpsProps {
  messages: QueuedMessage[];
  workspaceId?: string;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  disabled?: boolean;
}

export function QueuedFollowUps({
  messages,
  workspaceId,
  onRemove,
  onClearAll,
  disabled,
}: QueuedFollowUpsProps) {
  const { t } = useTranslation('tasks');
  if (messages.length === 0) return null;

  return (
    <div className="border-b border-border bg-muted/40">
      <div className="flex items-center gap-2 px-1 pb-1 pt-0.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('followUp.queuedCount', {
            defaultValue: 'Queued · {{count}}',
            count: messages.length,
          })}
        </span>
        <div className="min-w-0 flex-1" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          onClick={onClearAll}
          disabled={disabled}
        >
          {t('followUp.clearAll', 'Clear all')}
        </Button>
      </div>
      <div className="max-h-36 overflow-y-auto">
        {messages.map((item, index) => (
          <div
            key={item.id}
            className="flex items-start gap-2 border-t border-border/60 px-1 py-1.5 first:border-t-0"
          >
            <span
              className={
                index === 0
                  ? 'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground'
                  : 'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground'
              }
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              {index === 0 && (
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {t('followUp.next', 'Next')}
                </div>
              )}
              <div className="max-h-14 overflow-hidden">
                <WYSIWYGEditor
                  value={item.data.message}
                  disabled
                  actionsPlacement="none"
                  taskAttemptId={workspaceId}
                  className="text-sm leading-5"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              disabled={disabled}
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
              aria-label={t('followUp.removeQueued', 'Remove queued message')}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
