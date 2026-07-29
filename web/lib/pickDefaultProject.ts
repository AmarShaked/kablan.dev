import type { ProjectSummary } from "../api.ts";

/**
 * Chooses which project should be auto-selected when the app opens and nothing is selected yet.
 * Pure so App's effect (and its own tests) can reason about it in isolation from localStorage/
 * query state: prefer the last-opened project if it still exists, else the one with the most
 * recent activity (`lastCommitTs`, nulls sorted last since "no commit info" shouldn't outrank a
 * project we know is active), else just the first project in the list. `null` when there's
 * nothing to select.
 */
export function pickDefaultProject(projects: ProjectSummary[], lastOpenedName: string | null): string | null {
  if (projects.length === 0) return null;
  if (lastOpenedName && projects.some((p) => p.name === lastOpenedName)) return lastOpenedName;

  let best = projects[0];
  for (const p of projects.slice(1)) {
    const bestTs = best.lastCommitTs;
    const pTs = p.lastCommitTs;
    if (pTs !== null && (bestTs === null || pTs > bestTs)) best = p;
  }
  return best.name;
}
