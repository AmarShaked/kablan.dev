import type { QueueStatus, QueuedMessage } from 'shared/types';

export function queuedMessages(
  status: QueueStatus | undefined | null
): QueuedMessage[] {
  return status?.status === 'queued' ? status.messages : [];
}
