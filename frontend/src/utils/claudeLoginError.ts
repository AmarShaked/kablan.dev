/** Marker stored on the summary entry when that run died on a Claude login. */
export const CLAUDE_LOGIN_MARKER = 'claude_login';

/** `claude_login:<process id>` so the dialog opens once for that run. */
export function claudeLoginContent(processId: string): string {
  return `${CLAUDE_LOGIN_MARKER}:${processId}`;
}

export function claudeLoginProcessId(content: string): string | null {
  const prefix = `${CLAUDE_LOGIN_MARKER}:`;
  if (!content.startsWith(prefix)) return null;
  const id = content.slice(prefix.length);
  return id || null;
}

const openedClaudeLoginDialogs = new Set<string>();

/** Test hook. The set lives for the page, so tests have to empty it. */
export function resetClaudeLoginDialogClaims(): void {
  openedClaudeLoginDialogs.clear();
}

/**
 * True the first time this failed run should pop the sign-in dialog.
 * Later views of the same run keep the button and stay quiet.
 */
export function claimClaudeLoginDialog(processId: string): boolean {
  if (openedClaudeLoginDialogs.has(processId)) return false;
  openedClaudeLoginDialogs.add(processId);
  try {
    const key = `kablan:claude-login-dialog:${processId}`;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
  } catch {
    // The in-memory set still stops a second open in this page.
  }
  return true;
}

/**
 * Claude Code prints this when the subscription OAuth session can no longer
 * refresh. Matching the CLI's own wording, not a generic failure.
 */
export function isClaudeLoginError(content: string): boolean {
  const text = content.toLowerCase();
  return (
    text.includes('oauth session expired') ||
    text.includes('claude auth login') ||
    text.includes('please run /login')
  );
}
