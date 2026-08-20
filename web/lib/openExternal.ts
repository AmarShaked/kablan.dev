import { toast } from "sonner";
import { api } from "../api.ts";
import { isTauri } from "./version.ts";

/** Hrefs we hand to the OS browser. Everything else (in-app anchors, `#hash`, `file:`, custom
 * schemes) is left to the webview — transcripts render agent-authored markdown, so the allowlist
 * is deliberately narrow and mirrors the server's. */
export function isExternalHref(href: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(href.trim());
}

/**
 * Open a URL in the user's real browser.
 *
 * In the Tauri desktop shell, `window.open` and `<a target="_blank">` are silent no-ops: WKWebView
 * won't spawn a window and Tauri has no default handler, so clicking a link did nothing at all.
 * There, the URL goes to the backend's launcher (`open` / `xdg-open` / `explorer`) instead. In a
 * plain browser the native behaviour is already right, so it just opens a tab.
 */
export async function openExternal(url: string): Promise<void> {
  if (!isTauri) {
    window.open(url, "_blank", "noopener");
    return;
  }
  try {
    await api.openUrl(url);
  } catch (err) {
    toast.error(`Couldn't open ${url}: ${String(err)}`);
  }
}

/**
 * Route every external link click through `openExternal`, so anchors anywhere in the app (markdown
 * transcripts included) reach the browser instead of dead-ending in the webview. No-op outside the
 * desktop shell, where anchors already work. Returns a cleanup function.
 */
export function installExternalLinkHandler(): () => void {
  if (!isTauri || typeof document === "undefined") return () => {};
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const target = e.target as Element | null;
    const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (!isExternalHref(href)) return;
    e.preventDefault();
    void openExternal(anchor.href || href);
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
