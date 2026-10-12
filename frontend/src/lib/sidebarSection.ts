export type SidebarSort = 'az' | 'recency' | 'priority';

/** `'all'` shows the whole section. The other two are the per-section filters. */
export type SidebarFilter = 'all' | 'unreads' | 'connected';

export type SidebarSectionPrefs = {
  sort: SidebarSort;
  filter: SidebarFilter;
};

export const PROJECTS_SECTION_KEY = 'kablan.sidebar.projects.list';
export const INTEGRATIONS_SECTION_KEY = 'kablan.sidebar.integrations.list';

export const SIDEBAR_SORTS: { id: SidebarSort; label: string }[] = [
  { id: 'az', label: 'A-Z' },
  { id: 'recency', label: 'Recency' },
  { id: 'priority', label: 'Priority' },
];

const DEFAULT_PREFS: SidebarSectionPrefs = {
  sort: 'recency',
  filter: 'all',
};

export function sidebarSortLabel(sort: SidebarSort): string {
  return SIDEBAR_SORTS.find((option) => option.id === sort)?.label ?? 'Recency';
}

type ProjectRow = {
  name: string;
  created_at: Date | string;
  updated_at: Date | string;
  has_unseen_turns: boolean;
  running_count: bigint | number;
};

type IntegrationRow = {
  name: string;
  connected: boolean;
  /** Index in the saved list. There is no last-used time, so this is recency. */
  order: number;
};

function timestamp(value: Date | string): number {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/** Newest edit first. Created time breaks a tie, then the name. */
function byProjectRecency(a: ProjectRow, b: ProjectRow): number {
  return (
    timestamp(b.updated_at) - timestamp(a.updated_at) ||
    timestamp(b.created_at) - timestamp(a.created_at) ||
    byName(a, b)
  );
}

/**
 * Unread work is the thing waiting on you, then a running agent, then the rest.
 * Inside a tier, the more recently touched project stays on top.
 */
function projectPriority(project: ProjectRow): number {
  if (project.has_unseen_turns) return 0;
  const running =
    typeof project.running_count === 'bigint'
      ? project.running_count > 0n
      : project.running_count > 0;
  return running ? 1 : 2;
}

export function arrangeProjects<T extends ProjectRow>(
  projects: readonly T[],
  sort: SidebarSort,
  filter: SidebarFilter
): T[] {
  const visible =
    filter === 'unreads'
      ? projects.filter((project) => project.has_unseen_turns)
      : [...projects];
  const copy = [...visible];
  if (sort === 'az') copy.sort(byName);
  else if (sort === 'priority') {
    copy.sort(
      (a, b) =>
        projectPriority(a) - projectPriority(b) || byProjectRecency(a, b)
    );
  } else copy.sort(byProjectRecency);
  return copy;
}

export function arrangeIntegrations<T extends IntegrationRow>(
  integrations: readonly T[],
  sort: SidebarSort,
  filter: SidebarFilter
): T[] {
  const visible =
    filter === 'connected'
      ? integrations.filter((item) => item.connected)
      : [...integrations];
  const copy = [...visible];
  if (sort === 'az') copy.sort(byName);
  else if (sort === 'priority') {
    copy.sort(
      (a, b) => Number(b.connected) - Number(a.connected) || a.order - b.order
    );
  } else copy.sort((a, b) => a.order - b.order);
  return copy;
}

function isSort(value: unknown): value is SidebarSort {
  return value === 'az' || value === 'recency' || value === 'priority';
}

export function readSidebarSectionPrefs(
  storageKey: string,
  allowedFilters: readonly SidebarFilter[]
): SidebarSectionPrefs {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as { sort?: unknown; filter?: unknown };
    return {
      sort: isSort(parsed.sort) ? parsed.sort : DEFAULT_PREFS.sort,
      filter: allowedFilters.includes(parsed.filter as SidebarFilter)
        ? (parsed.filter as SidebarFilter)
        : DEFAULT_PREFS.filter,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writeSidebarSectionPrefs(
  storageKey: string,
  prefs: SidebarSectionPrefs
): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(prefs));
  } catch {
    // Private mode and a full disk both refuse the write. The choice still
    // applies for this visit.
  }
}
