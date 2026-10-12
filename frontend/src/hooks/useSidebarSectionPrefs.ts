import { useState } from 'react';
import {
  readSidebarSectionPrefs,
  writeSidebarSectionPrefs,
  type SidebarFilter,
  type SidebarSectionPrefs,
  type SidebarSort,
} from '@/lib/sidebarSection';

export function useSidebarSectionPrefs(
  storageKey: string,
  allowedFilters: readonly SidebarFilter[]
) {
  const [prefs, setPrefs] = useState<SidebarSectionPrefs>(() =>
    readSidebarSectionPrefs(storageKey, allowedFilters)
  );

  const update = (next: Partial<SidebarSectionPrefs>) => {
    setPrefs((current) => {
      const value = { ...current, ...next };
      writeSidebarSectionPrefs(storageKey, value);
      return value;
    });
  };

  return {
    sort: prefs.sort,
    filter: prefs.filter,
    setSort: (sort: SidebarSort) => update({ sort }),
    setFilter: (filter: SidebarFilter) => update({ filter }),
  };
}
