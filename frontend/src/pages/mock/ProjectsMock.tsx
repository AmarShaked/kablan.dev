import { useState } from 'react';
import type React from 'react';
import {
  Bell, Bookmark, Box, Bug, Calendar, ChevronDown, ChevronRight, Circle,
  Code, CreditCard, Database, Files, Flag, Flame, FolderGit2, FolderOpen,
  Gift, GitBranch, Globe, Heart, Image, Kanban, Layers, LayoutGrid, Leaf,
  type LucideIcon, Compass, MessageSquare, Monitor, Music, Package, Palette,
  Plus, Rocket, Server, Shield, Sparkles, SquareTerminal, Star, Target,
  Trophy, Users, Wrench, Zap, Film, BookOpen, Coffee, Cloud, ShoppingCart,
  Edit, ExternalLink, MoreHorizontal, Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * MOCK ONLY — /mock/projects
 *
 * A design sketch of the reworked projects page: list only, an icon per project, a task count,
 * and rows that expand to show the tasks underneath. Everything here is hardcoded; nothing talks
 * to the API. It lives in the app rather than in a separate HTML file so it renders with the real
 * tokens, fonts and theme switch — what you see is what the built page would look like.
 */

const ICONS: Record<string, LucideIcon> = {
  box: Box, folder: FolderOpen, repo: FolderGit2, rocket: Rocket, zap: Zap,
  star: Star, heart: Heart, flag: Flag, bookmark: Bookmark, bug: Bug,
  code: Code, terminal: SquareTerminal, globe: Globe, database: Database,
  server: Server, cloud: Cloud, monitor: Monitor, layers: Layers,
  grid: LayoutGrid, palette: Palette, sparkles: Sparkles, package: Package,
  cart: ShoppingCart, card: CreditCard, users: Users, chat: MessageSquare,
  calendar: Calendar, kanban: Kanban, branch: GitBranch, shield: Shield,
  bell: Bell, image: Image, music: Music, film: Film, book: BookOpen,
  coffee: Coffee, leaf: Leaf, flame: Flame, compass: Compass, target: Target,
  trophy: Trophy, gift: Gift, wrench: Wrench, files: Files,
};

type MockTask = { title: string; status: string; running?: boolean; server?: boolean };
type MockProject = { id: string; name: string; icon: string; repo: string; tasks: MockTask[] };

const INITIAL: MockProject[] = [
  {
    id: 'p1', name: 'kablan-app', icon: 'rocket', repo: 'kablan-app',
    tasks: [
      { title: 'Add list view to the projects page', status: 'In Progress', running: true },
      { title: 'Ship the Tauri desktop build', status: 'To Do' },
      { title: 'Remove upstream telemetry', status: 'Done' },
    ],
  },
  {
    id: 'p2', name: 'nitur', icon: 'zap', repo: 'nitur',
    tasks: [
      { title: 'Cache the dashboard aggregate query', status: 'In Review', server: true },
      { title: 'Drop the referrer path before storing', status: 'To Do' },
    ],
  },
  {
    id: 'p3', name: 'sweet-security', icon: 'shield', repo: 'sweet-security',
    tasks: [{ title: 'Rotate the staging credentials', status: 'To Do' }],
  },
  { id: 'p4', name: 'scratch', icon: 'box', repo: 'scratch', tasks: [] },
];

function IconPicker({
  value, onChange,
}: { value: string; onChange: (key: string) => void }) {
  const Current = ICONS[value] ?? Box;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          // The row toggles on click and Radix opens on pointer-down, so both have to be stopped
          // or picking an icon would also expand/collapse the project.
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label="Change project icon"
          title="Change icon"
          className="flex h-9 w-9 shrink-0 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <Current className="h-[18px] w-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[336px] p-2"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="grid grid-cols-8 gap-1">
          {Object.entries(ICONS).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-label={key}
              className={`flex h-9 w-9 items-center justify-center border transition-colors hover:bg-accent ${
                key === value
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectActions({ onOpen }: { onOpen: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          // Same guards as the icon picker: the row opens the project and Radix opens on
          // pointer-down, so both have to be stopped here.
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Project actions"
          className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onClick={onOpen}>
          <ExternalLink className="mr-2 h-4 w-4" />
          View Project
        </DropdownMenuItem>
        <DropdownMenuItem>
          <FolderOpen className="mr-2 h-4 w-4" />
          Open in IDE
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Edit className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProjectsMock() {
  const [projects, setProjects] = useState(INITIAL);
  const [open, setOpen] = useState<Record<string, boolean>>({ p1: true });
  // Mock stand-in for navigation, so the two interactions are visibly distinct.
  const [opened, setOpened] = useState<string | null>(null);

  const toggle = (id: string) =>
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  const setIcon = (id: string, icon: string) =>
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, icon } : p)));

  return (
    <div className="h-full overflow-auto p-8 pb-16">
      <div className="mx-auto max-w-4xl">
        <p className="font-ibm-plex-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Mock · not wired to data
        </p>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-medium tracking-tight">Projects</h1>
            <p className="text-muted-foreground">
              Manage your projects and track their progress
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Project
          </Button>
        </div>

        {opened && (
          <p className="font-ibm-plex-mono mt-6 border border-border bg-accent px-3 py-2 text-xs">
            → would open project: {opened}
          </p>
        )}

        <div className="mt-8 border-t border-border">
          {projects.map((project) => {
            const isOpen = open[project.id];
            const running = project.tasks.filter((t) => t.running).length;

            return (
              <div key={project.id} className="border-b border-border">
                <div
                  role="button"
                  tabIndex={0}
                  // The row opens the project; expanding is its own control, so you can peek at
                  // the tasks without leaving the page and open the project without expanding.
                  onClick={() => setOpened(project.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpened(project.name);
                    }
                  }}
                  className="flex items-center gap-2 py-2 pr-2 transition-colors hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(project.id);
                    }}
                    aria-label={isOpen ? 'Collapse tasks' : 'Expand tasks'}
                    aria-expanded={isOpen}
                    className="flex h-8 w-6 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>

                  <IconPicker
                    value={project.icon}
                    onChange={(icon) => setIcon(project.id, icon)}
                  />

                  <span className="min-w-0 flex-1 truncate font-medium">
                    {project.name}
                  </span>

                  {running > 0 && (
                    <span className="font-ibm-plex-mono shrink-0 bg-info/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-info">
                      {running} running
                    </span>
                  )}

                  <span className="font-ibm-plex-mono shrink-0 text-xs tabular-nums text-muted-foreground">
                    {project.tasks.length === 0
                      ? 'no tasks'
                      : `${project.tasks.length} ${project.tasks.length === 1 ? 'task' : 'tasks'}`}
                  </span>

                  <span className="hidden shrink-0 font-ibm-plex-mono text-xs text-muted-foreground sm:inline">
                    {project.repo}
                  </span>

                  <ProjectActions onOpen={() => setOpened(project.name)} />
                </div>

                {isOpen && (
                  <div className="pb-2 pl-[52px] pr-2">
                    {project.tasks.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">
                        No tasks yet.{' '}
                        <button className="underline underline-offset-2 hover:text-foreground">
                          Create the first one
                        </button>
                        .
                      </p>
                    ) : (
                      <ul>
                        {project.tasks.map((task) => (
                          <li
                            key={task.title}
                            className="flex items-center gap-3 border-t border-border/60 py-2 text-sm"
                          >
                            <Circle className="h-2 w-2 shrink-0 fill-current text-muted-foreground/40" />
                            <span className="min-w-0 flex-1 truncate">
                              {task.title}
                            </span>
                            {task.running && (
                              <span className="font-ibm-plex-mono shrink-0 bg-info/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-info">
                                Running
                              </span>
                            )}
                            {task.server && (
                              <span className="font-ibm-plex-mono shrink-0 bg-success/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-success">
                                Server
                              </span>
                            )}
                            <span className="font-ibm-plex-mono shrink-0 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                              {task.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
