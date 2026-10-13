import { Component, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { paths } from '@/lib/paths';

/**
 * Shown when the address does not name a page, or a page threw while rendering.
 *
 * Either way the window used to go blank: an unmatched route renders nothing, and a render
 * error unmounts the tree. The sidebar (when this sits in the page column) and these links
 * are how you leave — pick another project, or open a task list.
 */
export function RouteRecovery({
  title,
  detail,
  includeProjectTasks = true,
}: {
  title: string;
  detail: string;
  /** Hide when the link would only return to the same missing project. */
  includeProjectTasks?: boolean;
}) {
  const { pathname } = useLocation();
  const projectId = pathname.match(/^\/local-projects\/([^/]+)/)?.[1];
  const projectTasks = projectId ? paths.projectTasks(projectId) : null;
  const showProjectTasks =
    includeProjectTasks && projectTasks != null && pathname !== projectTasks;

  return (
    <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{detail}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {showProjectTasks && projectTasks && (
          <Button asChild>
            <Link to={projectTasks}>This project's tasks</Link>
          </Button>
        )}
        <Button asChild variant={showProjectTasks ? 'outline' : 'default'}>
          <Link to="/tasks">Tasks</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to={paths.projects()}>Projects</Link>
        </Button>
      </div>
    </div>
  );
}

/** The address matched no route. Stays in the layout so the sidebar is still there. */
export function UnknownRoute() {
  return (
    <RouteRecovery
      title="This page doesn't exist"
      detail="That address isn't a page in Kablan. Choose another project in the sidebar, or open a list of tasks."
    />
  );
}

type BoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

type BoundaryState = {
  error: Error | null;
  resetKey: string;
};

/**
 * Catches a render error in the page column and leaves the shell mounted.
 *
 * `resetKey` is the pathname: following a recovery link renders the next page instead of
 * sticking on the fallback.
 */
export class PageErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: BoundaryProps,
    state: BoundaryState
  ): Partial<BoundaryState> | null {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  render() {
    if (this.state.error) {
      return (
        <RouteRecovery
          title="This page couldn't be shown"
          detail="Something on this page failed to load. Choose another project in the sidebar, or open a different task."
        />
      );
    }
    return this.props.children;
  }
}

/** Resets the boundary when the address changes, so a recovery link actually leaves. */
export function PageBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <PageErrorBoundary resetKey={pathname}>{children}</PageErrorBoundary>;
}
