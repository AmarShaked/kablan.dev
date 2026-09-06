import { Navigate, useLocation, useParams } from 'react-router-dom';

/**
 * Sends `/projects/…` at `/local-projects/…`, keeping the rest of the path.
 *
 * The local task UI lives under `/local-projects`, but links to the shorter `/projects` prefix
 * were built in several places and shipped. Nothing matched them, and with no catch-all an
 * unmatched route renders nothing at all — so following one blanked the app rather than 404ing.
 * The callers are fixed; this keeps the links that already exist working.
 */
export function LegacyProjectsPrefixRedirect() {
  const params = useParams();
  const { search, hash } = useLocation();
  const rest = params['*'] ?? '';

  return <Navigate to={`/local-projects/${rest}${search}${hash}`} replace />;
}
