// Tracks dev-server working-copy cwds the user *intentionally* stopped (via the Stop button or a
// "Replace" swap), so `App`'s WebSocket handler can suppress the "dev server exited (code …)"
// crash toast for that expected exit. A short TTL bridges the async gap between issuing the stop
// and the process's exit frame arriving over the socket.
//
// Module-level singleton shared by import: the stopper (`Cockpit`) marks a cwd, the toast site
// (`App`) consumes it. Keeping it out of React state avoids threading a suppression set through
// props just for this.

const intents = new Map<string, number>();
const TTL_MS = 15_000;

/** Record that `cwd`'s dev server is being stopped on purpose (call right before `api.stopServer`). */
export function markIntentionalStop(cwd: string): void {
  intents.set(cwd, Date.now() + TTL_MS);
}

/** True (once) if `cwd`'s most recent exit was an intentional stop still within the TTL. Consumes
 * the mark either way, and lazily prunes expired entries. */
export function consumeIntentionalStop(cwd: string): boolean {
  const expiresAt = intents.get(cwd);
  intents.delete(cwd);
  return expiresAt !== undefined && expiresAt > Date.now();
}
