import { useEffect, useRef } from "react";
import type { AgentStatus, NotificationSettings } from "../api.ts";
import { useAgentStream } from "./useAgentStream.tsx";
import { shouldNotify } from "../lib/notify.ts";
import { isTauri } from "../lib/version.ts";

/** Sends one desktop notification. Kept as a thin, swappable seam so hook
 * tests can spy on it instead of touching the real Tauri notification plugin. */
export type SendNotification = (opts: { title: string; body: string }) => void;

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "idle",
  working: "working",
  awaitingInput: "needs your input",
  done: "finished",
  failed: "failed",
};

/**
 * Default sender: lazily imports the Tauri notification plugin (so it's never
 * pulled into the web build) and requests permission on first use, mirroring
 * how `lib/version.ts` talks to the updater/process plugins. A no-op outside
 * the desktop shell.
 */
export const sendDesktopNotification: SendNotification = ({ title, body }) => {
  if (!isTauri) return;
  void (async () => {
    try {
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        "@tauri-apps/plugin-notification"
      );
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      if (granted) sendNotification({ title, body });
    } catch {
      /* desktop notifications are a nicety, never fatal */
    }
  })();
};

/**
 * Watches every task force's agent status (via `useAgentStream`) for
 * transitions, and fires one desktop notification per qualifying transition —
 * `shouldNotify` decides based on `notifications.enabled`/`.events` and
 * whether the status actually changed (no repeats).
 *
 * `nameFor` resolves a branch's `agentKey` (`${project}::branch:${branch}`, see
 * `../lib/agentKey.ts`) to a display name (e.g. from the inbox/factory data already loaded
 * elsewhere); the key itself is used as a fallback when no name is available.
 *
 * Safe to call unconditionally (including outside Tauri) — the real send is
 * gated on `isTauri` inside `sendDesktopNotification`; only the injectable
 * `send` param (used by tests) bypasses that gate.
 */
export function useAgentNotifications(
  notifications: NotificationSettings,
  nameFor?: (key: string) => string | undefined,
  send: SendNotification = sendDesktopNotification,
) {
  const { version, snapshotStatuses } = useAgentStream();
  const prevRef = useRef<Map<string, AgentStatus>>(new Map());

  useEffect(() => {
    const statuses = snapshotStatuses();
    for (const [key, status] of Object.entries(statuses)) {
      const prev = prevRef.current.get(key);
      if (shouldNotify(prev, status, notifications)) {
        const who = nameFor?.(key) || key;
        send({ title: `${who} needs attention`, body: STATUS_LABEL[status] });
      }
      prevRef.current.set(key, status);
    }
  }, [version, notifications, nameFor, send, snapshotStatuses]);
}
