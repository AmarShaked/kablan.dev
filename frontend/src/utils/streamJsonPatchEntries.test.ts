import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamJsonPatchEntries } from './streamJsonPatchEntries';

type Handler = ((ev?: unknown) => void) | null;

class FakeWebSocket {
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  onopen: Handler = null;
  onmessage: Handler = null;
  onerror: Handler = null;
  onclose: Handler = null;
  private listeners = new Map<string, Set<(ev?: unknown) => void>>();

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => this.emit('open'));
  }

  static instances: FakeWebSocket[] = [];

  addEventListener(type: string, cb: (ev?: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }

  close() {
    this.emit('close');
  }

  emit(type: string, data?: unknown) {
    for (const cb of this.listeners.get(type) ?? []) {
      if (type === 'message') cb({ data });
      else cb();
    }
  }
}

describe('streamJsonPatchEntries', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats an unexpected close as an error so live chats can reconnect', async () => {
    const onError = vi.fn();
    const onFinished = vi.fn();
    streamJsonPatchEntries('/api/logs/ws', { onError, onFinished });

    await Promise.resolve();
    const ws = FakeWebSocket.instances[0]!;
    ws.emit('close');

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onFinished).not.toHaveBeenCalled();
  });

  it('does not error after a finished message', async () => {
    const onError = vi.fn();
    const onFinished = vi.fn();
    streamJsonPatchEntries('/api/logs/ws', { onError, onFinished });

    await Promise.resolve();
    const ws = FakeWebSocket.instances[0]!;
    ws.emit('message', JSON.stringify({ finished: true }));

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not error when the caller closes the stream', async () => {
    const onError = vi.fn();
    const controller = streamJsonPatchEntries('/api/logs/ws', { onError });

    await Promise.resolve();
    controller.close();

    expect(onError).not.toHaveBeenCalled();
  });
});
