/** Best-effort parse of a numbered (`1.`/`1)`) or bulleted (`-`/`*`) list out of an agent
 * message's text, so the cockpit can offer the options as pick-and-send chips. Returns up to
 * ~6 items in order of appearance; returns `[]` when the text has no such list (plain prose). */
export function parseChoices(text: string): { label: string }[] {
  if (!text) return [];

  const MAX_ITEMS = 6;
  const numberedRe = /^\s*\d+[.)]\s+(.+)$/;
  const bulletRe = /^\s*[-*]\s+(.+)$/;

  const items: { label: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (items.length >= MAX_ITEMS) break;
    const match = numberedRe.exec(line) ?? bulletRe.exec(line);
    if (!match) continue;
    const label = match[1].trim();
    if (label) items.push({ label });
  }
  return items;
}
