import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Archive, ListChecks, Moon, Plus, Settings, Sun } from 'lucide-react';

import { ThemeMode } from 'shared/types';
import { projectStatsApi } from '@/lib/api';
import { projectIcon } from '@/components/projects/projectIcons';
import { ProjectFormDialog } from '@/components/dialogs/projects/ProjectFormDialog';
import { openTaskForm } from '@/lib/openTaskForm';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';
import { BuildBadges } from '@/components/layout/BuildBadges';
import { useTheme } from '@/components/ThemeProvider';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { getActualTheme } from '@/utils/theme';
import { UsageGraph } from '@/components/UsageGraph';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { projectKeys } from '@/lib/queryKeys';

/**
 * Every project, always in reach — plus the two app-level controls that used to live in the
 * navbar's hamburger.
 *
 * Switching projects meant going back to the projects page and picking one: a round trip through
 * a page you did not want, for something you do all day once work is running in more than one
 * place. Settings and the theme moved down here because they belong to the app rather than to
 * whichever project is open, and the navbar had become a row of unrelated icons.
 *
 * Built on the shadcn sidebar, so the rail, the collapse behaviour, the mobile sheet and the
 * ⌘B shortcut are the component's rather than ours to maintain. Collapsed, it keeps a rail of
 * icons instead of disappearing: the point is to keep the switch available, not the names.
 */
export function ProjectsSidebar() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { config, updateAndSaveConfig } = useUserSystem();

  // The same query the projects page uses, so the two share one fetch and one cache.
  const { data: projects = [] } = useQuery({
    queryKey: projectKeys.withStats,
    queryFn: projectStatsApi.listWithStats,
    // The dot is the only thing outside a project that says it wants attention, and nothing
    // pushes turns at this query — so it asks, at the pace an agent finishes work.
    refetchInterval: 30_000,
  });

  const [usageKey, setUsageKey] = React.useState(0);
  const [isLoadingUsage, setIsLoadingUsage] = React.useState(false);

  const activeId = location.pathname.match(/^\/local-projects\/([^/]+)/)?.[1];
  const isArchiveView =
    location.pathname === '/tasks' &&
    new URLSearchParams(location.search).get('archive') === 'archived';

  const isDark = getActualTheme(theme) === 'dark';
  const nextTheme = isDark ? ThemeMode.LIGHT : ThemeMode.DARK;

  const toggleTheme = async () => {
    setTheme(nextTheme);
    if (!config) return;
    try {
      // Only the delta: updateAndSaveConfig merges into the current config itself, so writing
      // the whole object back could rewind a field someone changed elsewhere.
      await updateAndSaveConfig({ theme: nextTheme });
    } catch (err) {
      // Non-fatal: the theme still changed for this session.
      console.error('Failed to persist theme preference:', err);
    }
  };

  const handleReloadUsage = async () => {
    setIsLoadingUsage(true);
    // Simulate loading delay for visual feedback
    await new Promise((resolve) => setTimeout(resolve, 500));
    setUsageKey((prev) => prev + 1);
    setIsLoadingUsage(false);
  };

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="h-12 justify-center">
        {/* A row of its own rather than `flex-row` on the header: this project's `cn` is plain
            clsx with tailwind-merge disabled, so a conflicting utility passed through className
            does not win — the later of the two in Tailwind's output does. */}
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          {/* The wordmark does not fit a 3rem rail, so collapsed it becomes its initial — the
              same letter the app icon uses, so the rail still reads as Kablan. */}
          <Link
            to="/local-projects"
            className="flex items-center px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            aria-label="Kablan"
          >
            <span className="group-data-[collapsible=icon]:hidden">
              <Logo />
            </span>
            <span
              aria-hidden
              className="font-ibm-plex-mono hidden text-lg font-bold uppercase tracking-[0.18em] group-data-[collapsible=icon]:inline"
            >
              K
            </span>
          </Link>
          <BuildBadges />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* The one thing you do more than read: start work. It sits above everything, and it is
            the only place a task can be created without first choosing where you are — so the
            form asks which project. */}
        <SidebarGroup className="pb-0">
          <SidebarGroupContent>
            <Button
              size="sm"
              title="New task"
              // Collapsed, the sidebar is a column of 32px glyphs; the button becomes one of
              // them rather than a stretched pill with a clipped label.
              className={cn(
                'w-full justify-start gap-2',
                'group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!px-0'
              )}
              onClick={() => openTaskForm({ mode: 'create' }).catch(() => {})}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">
                New task
              </span>
            </Button>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Above the projects, because these are the views you take when you do not yet know
            which project the work is in. */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/tasks' && !isArchiveView}
                  tooltip="Tasks"
                >
                  <Link to="/tasks">
                    <ListChecks />
                    <span>Tasks</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isArchiveView}
                  tooltip="Archive"
                >
                  {/* The same cross-project list, asked a different question. */}
                  <Link to="/tasks?archive=archived">
                    <Archive />
                    <span>Archive</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupAction
            title="New project"
            onClick={() => ProjectFormDialog.show({}).catch(() => {})}
          >
            <Plus />
            <span className="sr-only">New project</span>
          </SidebarGroupAction>

          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => {
                const Icon = projectIcon(project.icon);
                const isActive = project.id === activeId;

                return (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={
                        project.has_unseen_turns
                          ? `${project.name} — something to read`
                          : project.name
                      }
                    >
                      <Link to={`/local-projects/${project.id}/tasks`}>
                        <Icon />
                        <span>{project.name}</span>
                      </Link>
                    </SidebarMenuButton>
                    {/* A dot, not a number: the count switched between "running" and "total"
                        with only its colour to say which, and neither number told you whether
                        the project wanted anything from you. This does. */}
                    {project.has_unseen_turns && (
                      <SidebarMenuBadge>
                        <span
                          className="h-2 w-2 rounded-full bg-info"
                          aria-label="Unread agent messages"
                          role="img"
                        />
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UsageGraph key={usageKey} onReload={handleReloadUsage} isLoading={isLoadingUsage} />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggleTheme} tooltip="Theme">
              {isDark ? <Sun /> : <Moon />}
              <span>{isDark ? 'Light theme' : 'Dark theme'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={location.pathname.startsWith('/settings')}
              tooltip="Settings"
            >
              <Link
                to={
                  activeId
                    ? `/settings/projects?projectId=${activeId}`
                    : '/settings'
                }
              >
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* The draggable edge: collapses the sidebar without hunting for a button. */}
      <SidebarRail />
    </Sidebar>
  );
}
