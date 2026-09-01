/**
 * The agent is thinking.
 *
 * The mark is the app's own initial rather than a spinner: a spinner says "a thing is loading",
 * which is true of a dozen elements on this page, while a lit K says the agent specifically is
 * working. The light sweeps across the letterform instead of moving it, so it reads as alive
 * without adding a second moving object to a transcript that is already streaming text.
 *
 * The sweep is a gradient clipped to the glyph, so it costs one compositor animation and no
 * layout. It stops entirely for anyone who has asked the system for less motion.
 */
export function ThinkingIndicator({ label = 'Thinking' }: { label?: string }) {
  return (
    <div
      className="flex items-center gap-2.5"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span
        aria-hidden
        className="kablan-thinking-mark font-ibm-plex-mono text-lg font-medium uppercase tracking-[0.16em]"
      >
        K
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
