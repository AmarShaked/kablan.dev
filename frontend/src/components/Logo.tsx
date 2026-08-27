/**
 * Kablan wordmark.
 *
 * Upstream shipped the "VIBE-KANBAN" wordmark as a hand-traced SVG path, which can't be edited
 * into a new name. This renders the name as text in the UI's own display face (IBM Plex Mono),
 * so it matches the rest of the chrome and stays trivially editable.
 */
export function Logo() {
  return (
    <span
      className="logo select-none font-ibm-plex-mono text-lg font-bold uppercase tracking-[0.18em] text-foreground"
      aria-label="Kablan"
    >
      Kablan
    </span>
  );
}
