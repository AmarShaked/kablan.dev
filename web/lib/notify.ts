import type { AgentStatus, NotificationSettings } from "../api.ts";

/**
 * Pure decision function for desktop notifications: true iff notifications are
 * enabled, `next` is a genuine transition (not a repeat of the same status —
 * so we never notify twice for the same state), and `next`'s status name is
 * one of the events the user opted into (`awaitingInput` / `failed` / `done`).
 */
export function shouldNotify(
  prev: AgentStatus | undefined,
  next: AgentStatus,
  cfg: NotificationSettings,
): boolean {
  if (!cfg.enabled) return false;
  if (prev === next) return false;
  return cfg.events.includes(next);
}
