import { Navigate, useLocation, useParams } from 'react-router-dom';
import { paths } from '@/lib/paths';

/**
 * Sends the old per-attempt URLs at the task that owns them.
 *
 * A task has one run, so `/tasks/:taskId/attempts/:attemptId` names the task twice. The old
 * shape stays routable rather than 404-ing because it is in bookmarks, in editor extensions and
 * in every link the app has handed out until now — including `attempts/latest`, which was only
 * ever a way of asking for this page. The query string rides along: `?view=diffs` and friends
 * still say which pane to open.
 */
export function LegacyAttemptRedirect({ full = false }: { full?: boolean }) {
  const { projectId, taskId } = useParams<{
    projectId: string;
    taskId: string;
  }>();
  const { search } = useLocation();

  if (!projectId || !taskId) {
    return <Navigate to={paths.projects()} replace />;
  }

  const target = full
    ? paths.taskFull(projectId, taskId)
    : paths.task(projectId, taskId);

  return <Navigate to={`${target}${search}`} replace />;
}
