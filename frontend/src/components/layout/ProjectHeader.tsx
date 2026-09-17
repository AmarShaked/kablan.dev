import { useCallback } from 'react';
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SearchBar } from '@/components/SearchBar';
import { WarzoneToolbar } from '@/components/warzone/WarzoneToolbar';
import { useTask } from '@/hooks/useTask';
import { useWarzoneChrome } from '@/hooks/useWarzoneChrome';
import { useProject } from '@/contexts/ProjectContext';
import { useSearch } from '@/contexts/SearchContext';
import { useUserSystem } from '@/contexts/UserSystemContext';
import {
  ADD_AGENT_PATH,
  isAgentsPath,
  parseAgentParam,
} from '@/lib/routes/agentRoutes';
import {
  ADD_INTEGRATION_PATH,
  isIntegrationsPath,
  parseIntegrationParam,
} from '@/lib/routes/integrationRoutes';
import { isProjectSettingsPath } from '@/lib/routes/projectRoutes';
import { paths } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { agentLabel } from '@/utils/agentLabels';
import { integrationLabel } from '@/lib/integrations/catalog';
import { TaskSourceBadge } from '@/components/tasks/TaskSourceBadge';

function WarzoneHeaderChrome() {
  const chrome = useWarzoneChrome();
  return <WarzoneToolbar {...chrome} />;
}

/**
 * Where you are, what you're searching, and what you can do here.
 *
 * This replaces the navbar, which had become a row of things that belonged to different places:
 * a logo and a settings button that belong to the app (now the sidebar's), beside a search and a
 * new-task button that belong to whichever project is open. Since the sidebar is a full-height
 * column, everything to the right of it is the project's — so it gets one header, not two.
 *
 * The breadcrumb earns its place now that the sidebar can switch projects from anywhere: the
 * page had stopped saying which project it was showing, and getting from a task back to its
 * project meant the browser's back button. Only the last crumb is inert — a breadcrumb you
 * cannot click is a label with slashes in it.
 */
export function ProjectHeader() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { projectId, project } = useProject();
  const { taskId } = useParams<{ taskId: string }>();
  const { data: task } = useTask(taskId);
  const { query, setQuery, active, clear, registerInputRef } = useSearch();
  const { loginStatus } = useUserSystem();
  const { t } = useTranslation(['tasks', 'common']);
  const { t: tSettings } = useTranslation('settings');

  const setSearchBarRef = useCallback(
    (node: HTMLInputElement | null) => registerInputRef(node),
    [registerInputRef]
  );

  const isSettings = location.pathname.startsWith('/settings');
  const isAgents = isAgentsPath(location.pathname);
  const isIntegrations = isIntegrationsPath(location.pathname);
  const isProjectSettings = isProjectSettingsPath(location.pathname);
  const isAddAgent = location.pathname === ADD_AGENT_PATH;
  const isAddIntegration = location.pathname === ADD_INTEGRATION_PATH;
  const headerAgent = parseAgentParam(location.pathname.split('/')[2]);
  const headerIntegration = parseIntegrationParam(
    location.pathname.split('/')[2]
  );
  const isAllTasks = location.pathname === '/tasks';
  const isWarzone = location.pathname === paths.warzone();
  // Settings is a destination of its own, not a page inside a project — its trail starts at
  // Settings and names the section, rather than claiming to sit under Projects.
  const settingsSection = isSettings
    ? (location.pathname.split('/')[2] ?? null)
    : null;
  const isTasksRoute = /^\/local-projects\/[^/]+\/tasks/.test(
    location.pathname
  );
  const showSharedTasks = searchParams.get('shared') !== 'off';
  const shouldShowSharedToggle =
    isTasksRoute &&
    active &&
    project?.remote_project_id != null &&
    loginStatus?.status === 'loggedin';

  const handleSharedToggle = useCallback(
    (checked: boolean) => {
      const params = new URLSearchParams(searchParams);
      if (checked) params.delete('shared');
      else params.set('shared', 'off');
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  return (
    // Three equal-width tracks rather than a flex row: the search is centred on the header, not
    // on whatever space the breadcrumb happens to leave, so it stays put as the breadcrumb grows.
    // Warzone replaces the breadcrumb + search with its own chrome row.
    <header
      className={cn(
        'flex h-12 shrink-0 items-center gap-2 border-b border-border px-3',
        !isWarzone && 'grid grid-cols-[1fr_auto_1fr]'
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger className="-ml-1 h-6 w-6 shrink-0 [&_svg]:size-3.5" />
        <Separator orientation="vertical" className="mr-1 h-4 shrink-0" />

        {isWarzone ? (
          <div className="min-w-0 flex-1 overflow-x-auto">
            <WarzoneHeaderChrome />
          </div>
        ) : (
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem>
              {isSettings ? (
                settingsSection ? (
                  <BreadcrumbLink asChild>
                    <Link to="/settings/general">
                      {tSettings('settings.layout.nav.title')}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>
                    {tSettings('settings.layout.nav.title')}
                  </BreadcrumbPage>
                )
              ) : isAgents ? (
                isAddAgent || headerAgent ? (
                  <BreadcrumbLink asChild>
                    <Link to="/agents">Agents</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>Agents</BreadcrumbPage>
                )
              ) : isIntegrations ? (
                isAddIntegration || headerIntegration ? (
                  <BreadcrumbLink asChild>
                    <Link to="/integrations">Integrations</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>Integrations</BreadcrumbPage>
                )
              ) : isAllTasks ? (
                <BreadcrumbPage>Tasks</BreadcrumbPage>
              ) : projectId ? (
                <BreadcrumbLink asChild>
                  <Link to="/local-projects">Projects</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>Projects</BreadcrumbPage>
              )}
            </BreadcrumbItem>

            {settingsSection && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {tSettings(`settings.layout.nav.${settingsSection}`)}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}

            {isAgents && (isAddAgent || headerAgent) && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {isAddAgent ? 'Add agent' : agentLabel(headerAgent)}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}

            {isIntegrations && (isAddIntegration || headerIntegration) && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {isAddIntegration
                      ? 'Add integration'
                      : headerIntegration
                        ? integrationLabel(headerIntegration)
                        : ''}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}

            {!isSettings && !isAgents && !isIntegrations && project && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0">
                  {taskId || isProjectSettings ? (
                    <BreadcrumbLink asChild>
                      <Link
                        to={`/local-projects/${project.id}/tasks`}
                        className="truncate"
                      >
                        {project.name}
                      </Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="truncate">
                      {project.name}
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </>
            )}

            {isProjectSettings && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Settings</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}

            {/* The task's crumb waits for the title rather than showing its id: an id in a
              breadcrumb tells you nothing, and the title arrives a moment later anyway. */}
            {taskId && task && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{task.title}</span>
                    <TaskSourceBadge task={task} />
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
        )}
      </div>

      {!isWarzone && (
        <div className="hidden justify-self-center sm:flex">
          <SearchBar
            ref={setSearchBarRef}
            value={query}
            onChange={setQuery}
            disabled={!active}
            onClear={clear}
            project={project || null}
          />
        </div>
      )}

      {!isWarzone && (
        <div className="flex shrink-0 items-center justify-end gap-2">
          {shouldShowSharedToggle && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Switch
                      checked={showSharedTasks}
                      onCheckedChange={handleSharedToggle}
                      aria-label={t('tasks:filters.sharedToggleAria')}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t('tasks:filters.sharedToggleTooltip')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
    </header>
  );
}
