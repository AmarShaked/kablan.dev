import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useProjectMutations } from './useProjectMutations';
import { projectsApi } from '@/lib/api';
import { projectKeys } from '@/lib/queryKeys';
import type { Project } from 'shared/types';

vi.mock('@/lib/api', () => ({
  projectsApi: { update: vi.fn(), create: vi.fn() },
}));

const project = {
  id: 'p1',
  name: 'Sweet',
  icon: 'rocket',
} as unknown as Project;

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // createElement rather than JSX so this stays a .ts file: the lint rule wants PascalCase for
  // .tsx, and this belongs beside the hook it tests.
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

describe('useProjectMutations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refreshes the stats query the sidebar reads, not just the plain list', async () => {
    // The reported bug: saving a new icon left the sidebar drawing the old one, because
    // ['projects', 'with-stats'] is a different entry from the ['projects'] this hook patches
    // by hand, and nothing invalidated it until a reload.
    vi.mocked(projectsApi.update).mockResolvedValue(project);
    const { client, wrapper } = harness();
    client.setQueryData(projectKeys.withStats, [{ ...project, icon: 'heart' }]);
    client.setQueryData(['projects'], [{ ...project, icon: 'heart' }]);

    const { result } = renderHook(() => useProjectMutations(), { wrapper });
    result.current.updateProject.mutate({
      projectId: 'p1',
      data: { name: 'Sweet', icon: 'rocket' } as never,
    });

    await waitFor(() => {
      const stats = client
        .getQueryCache()
        .find({ queryKey: projectKeys.withStats });
      expect(stats?.isStale()).toBe(true);
    });
  });

  it('still updates the two caches it writes directly, so the change shows at once', async () => {
    vi.mocked(projectsApi.update).mockResolvedValue(project);
    const { client, wrapper } = harness();
    client.setQueryData(['projects'], [{ ...project, icon: 'heart' }]);

    const { result } = renderHook(() => useProjectMutations(), { wrapper });
    result.current.updateProject.mutate({
      projectId: 'p1',
      data: { name: 'Sweet', icon: 'rocket' } as never,
    });

    await waitFor(() => {
      expect(client.getQueryData(projectKeys.detail('p1'))).toEqual(project);
      expect(client.getQueryData<Project[]>(['projects'])?.[0].icon).toBe(
        'rocket'
      );
    });
  });
});
