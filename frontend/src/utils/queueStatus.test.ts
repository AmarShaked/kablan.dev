import { describe, expect, it } from 'vitest';
import type { QueueStatus } from 'shared/types';
import { queuedMessages } from './queueStatus';

describe('queuedMessages', () => {
  it('returns an empty list when nothing is queued', () => {
    expect(queuedMessages({ status: 'empty' })).toEqual([]);
    expect(queuedMessages(undefined)).toEqual([]);
  });

  it('returns every queued message in order', () => {
    const status = {
      status: 'queued',
      messages: [
        {
          id: 'a',
          session_id: 's',
          queued_at: '1',
          data: { message: 'first' },
        },
        {
          id: 'b',
          session_id: 's',
          queued_at: '2',
          data: { message: 'second' },
        },
      ],
    } as QueueStatus;
    expect(queuedMessages(status).map((m) => m.data.message)).toEqual([
      'first',
      'second',
    ]);
  });
});
