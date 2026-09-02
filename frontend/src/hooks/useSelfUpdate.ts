import { useCallback, useState } from 'react';

import { systemApi } from '@/lib/api';

type State =
  | { status: 'idle' }
  | { status: 'updating'; message: string }
  // The installed app can restart itself; a dev build or bare binary cannot, and says so — the
  // caller falls back to the copyable command.
  | { status: 'unsupported'; message: string }
  | { status: 'error'; message: string };

/**
 * Drives the one-click update: ask the server to update and reopen, and report what happened.
 *
 * On success the server exits and the socket drops, so there is no second response to await —
 * the app is going down and will come back on its own. The button's job afterwards is only to
 * say so; `updating` is the resting state until the page reloads with the new version.
 */
export function useSelfUpdate() {
  const [state, setState] = useState<State>({ status: 'idle' });

  const update = useCallback(async () => {
    setState({ status: 'updating', message: 'Updating…' });
    try {
      const { message } = await systemApi.updateAndRestart();
      setState({ status: 'updating', message });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not start the update.';
      // The server saying it cannot restart itself is not a failure to show as one: it means run
      // the command by hand, which is what the caller shows next to this.
      const unsupported = message.includes('npx kablan@latest');
      setState({ status: unsupported ? 'unsupported' : 'error', message });
    }
  }, []);

  return { state, update };
}
