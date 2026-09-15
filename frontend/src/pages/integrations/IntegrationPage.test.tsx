import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { IntegrationProvider } from 'shared/types';
import { IntegrationPage } from './IntegrationPage';

const { isConnected } = vi.hoisted(() => ({
  isConnected: vi.fn(() => false),
}));

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'LIGHT' }),
}));

vi.mock('@/contexts/UserSystemContext', () => ({
  useUserSystem: () => ({ reloadSystem: vi.fn(), config: null }),
}));

vi.mock('@/hooks/useAllTasks', () => ({
  useAllTasks: () => ({ tasks: [] }),
}));

vi.mock('@/hooks/useLinearIssues', () => ({
  useInvalidateLinearQueries: () => vi.fn(),
  useLinearIssuesInfinite: () => ({
    data: { issues: [], totalCount: 0 },
    isLoading: false,
    isFetching: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useLinearMeta: () => ({
    data: {
      viewer: { id: 'v', name: 'You' },
      states: [],
      teams: [],
      users: [],
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useConfiguredIntegrations', () => ({
  useConfiguredIntegrations: () => ({
    enabledIntegrations: [] as IntegrationProvider[],
    isConnected,
    removeIntegration: vi.fn(),
  }),
}));

beforeEach(() => {
  isConnected.mockReturnValue(false);
  class FakeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  global.IntersectionObserver =
    FakeObserver as unknown as typeof IntersectionObserver;
  global.ResizeObserver = FakeObserver as unknown as typeof ResizeObserver;
});

function Landed() {
  const { pathname } = useLocation();
  return <div data-testid="landed">{pathname}</div>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/integrations/new" element={<Landed />} />
        <Route path="/integrations/:provider" element={<IntegrationPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('IntegrationPage after add', () => {
  it('shows Linear configure when the provider is not in enabledIntegrations yet', () => {
    renderAt('/integrations/LINEAR');

    expect(screen.queryByTestId('landed')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Linear' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('still sends an unknown provider at the add page', () => {
    renderAt('/integrations/not-a-provider');
    expect(screen.getByTestId('landed').textContent).toBe('/integrations/new');
  });
});

describe('Linear inbox layout', () => {
  it('lets you drag to resize the inbox, like the project task list', () => {
    isConnected.mockReturnValue(true);
    renderAt('/integrations/LINEAR');

    expect(
      screen.getByRole('separator', { name: 'Resize panels' })
    ).toBeInTheDocument();
  });
});
