/** Permission-mode options, shared by every picker so they can't drift apart.
 *
 * `value` is what reaches the agent launch (`--permission-mode`), except "supervised", which Kablan
 * implements itself: it launches the CLI in bypassPermissions and gates each tool through the
 * Approve/Deny cards (see `build_agent_argv` in src-tauri/src/agents.rs).
 */
export type PermissionOption = { value: string; label: string };

/** Fallback when no default is configured (or the configured one isn't offered). */
export const FALLBACK_PERMISSION_MODE = "acceptEdits";

/** Offered wherever a mode is chosen for ONE agent — the cockpit composer and the New-session
 * dialog. Covers every mode the Settings default can hold, so a configured default is always
 * representable, plus "plan" (per-session only: `config.rs` rejects it as a stored default). */
export const PERMISSION_OPTIONS: PermissionOption[] = [
  { value: "default", label: "Ask" },
  { value: "acceptEdits", label: "Accept edits" },
  { value: "plan", label: "Plan" },
  { value: "supervised", label: "Supervised" },
  { value: "auto", label: "Auto" },
  { value: "bypassPermissions", label: "Bypass" },
];

/** Offered in Settings → Agent factory as the default for newly started agents. Same modes with
 * spelled-out labels, minus "plan" — the server only accepts these five (see `config.rs`). */
export const SETTINGS_PERMISSION_OPTIONS: PermissionOption[] = [
  { value: "default", label: "Ask (default)" },
  { value: "acceptEdits", label: "Accept edits" },
  { value: "supervised", label: "Supervised — approve each tool" },
  { value: "auto", label: "Auto" },
  { value: "bypassPermissions", label: "Bypass all" },
];

/** Resolve a configured default (factory.permissionMode) to a per-session picker value. */
export function resolvePermissionMode(configured?: string): string {
  return PERMISSION_OPTIONS.some((o) => o.value === configured)
    ? (configured as string)
    : FALLBACK_PERMISSION_MODE;
}
