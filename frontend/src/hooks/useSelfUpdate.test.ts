import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useSelfUpdate } from './useSelfUpdate';
import { systemApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  systemApi: { updateAndRestart: vi.fn() },
}));

/**
 * The states that matter are the two failures: a build that cannot restart is not an error to
 * shout about — it means show the command — while a real failure is. Telling them apart is the
 * hook's whole job, and it does it by the message the server sends.
 */
describe('useSelfUpdate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('goes to updating and keeps the server message', async () => {
    vi.mocked(systemApi.updateAndRestart).mockResolvedValue({
      message: 'Updating and restarting — the app will reopen in a moment.',
    });
    const { result } = renderHook(() => useSelfUpdate());

    await act(async () => {
      await result.current.update();
    });

    expect(result.current.state).toEqual({
      status: 'updating',
      message: 'Updating and restarting — the app will reopen in a moment.',
    });
  });

  it('reads a "cannot restart" refusal as unsupported, not an error', async () => {
    vi.mocked(systemApi.updateAndRestart).mockRejectedValue(
      new Error(
        'This build cannot restart itself. Quit and run `npx kablan@latest`.'
      )
    );
    const { result } = renderHook(() => useSelfUpdate());

    await act(async () => {
      await result.current.update();
    });

    expect(result.current.state.status).toBe('unsupported');
  });

  it('reads any other failure as an error', async () => {
    vi.mocked(systemApi.updateAndRestart).mockRejectedValue(
      new Error('Could not start the update.')
    );
    const { result } = renderHook(() => useSelfUpdate());

    await act(async () => {
      await result.current.update();
    });

    expect(result.current.state.status).toBe('error');
  });

  it('shows the updating state while the request is in flight', async () => {
    let resolve!: (v: { message: string }) => void;
    vi.mocked(systemApi.updateAndRestart).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    const { result } = renderHook(() => useSelfUpdate());

    act(() => {
      result.current.update();
    });
    await waitFor(() => expect(result.current.state.status).toBe('updating'));

    resolve({ message: 'done' });
  });
});
