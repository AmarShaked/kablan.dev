// Injected by Vite `define` at build time.
declare const __APP_VERSION__: string;
declare const __GH_REPO__: string;

interface Window {
  /** Injected by the Tauri shell so the web UI can reach the local backend. */
  __KABLAN_PORT__?: number;
}
