/**
 * The desktop app's self-update.
 *
 * Kablan runs in two places from one bundle: a browser tab served by the CLI, and the Tauri
 * window. Only the second can update itself, so everything here is a no-op in the browser and
 * the plugin modules are imported lazily — a browser build must never pull the Tauri API in.
 */

/** True when this page is the desktop window rather than a browser tab. */
export const isDesktop =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface AvailableUpdate {
  version: string;
  notes?: string;
  /** Download, install in place, and relaunch. Resolves only if something goes wrong. */
  install: () => Promise<void>;
}

/**
 * Ask the updater whether a newer signed release exists.
 *
 * Installing happens in place rather than through a browser download, so macOS does not put the
 * new copy through Gatekeeper again. Returns null in the browser, when already current, and when
 * the check fails — a machine that is offline or behind a proxy should not be shown an error it
 * cannot act on.
 */
export async function checkForDesktopUpdate(): Promise<AvailableUpdate | null> {
  if (!isDesktop) return null;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      notes: update.body ?? undefined,
      install: async () => {
        await update.downloadAndInstall();
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      },
    };
  } catch {
    return null;
  }
}
