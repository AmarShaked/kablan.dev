import type { QueryClient } from '@tanstack/react-query';
import { projectKeys, taskKeys } from '@/lib/queryKeys';

/**
 * Refresh every cached view a task change can be seen through.
 *
 * The project board streams its tasks over a WebSocket, so archiving or deleting there corrects
 * itself. Nothing else does: the archived listing, the cross-project lists and the sidebar's
 * per-project counts are all React Query entries under their own keys, and a write that only
 * patches the entry nearest to hand leaves the rest showing the task exactly where it no longer
 * is — until the page is reloaded, which is how this was reported.
 *
 * Prefix keys, deliberately: `['tasks', 'byProject', id]` covers that project's active, archived
 * and all listings at once, and archiving is precisely a move between them.
 *
 * @param projectIds the projects touched; omit to refresh every project's listing
 */
export function invalidateTaskViews(
  queryClient: QueryClient,
  projectIds?: string[]
) {
  const unique = [...new Set(projectIds ?? [])];

  if (unique.length === 0) {
    queryClient.invalidateQueries({ queryKey: taskKeys.all });
  } else {
    for (const id of unique) {
      queryClient.invalidateQueries({ queryKey: taskKeys.byProject(id) });
    }
  }

  // The sidebar's counts and unread dots are drawn from the project stats, which no task write
  // touches on its own.
  queryClient.invalidateQueries({ queryKey: projectKeys.withStats });
}
