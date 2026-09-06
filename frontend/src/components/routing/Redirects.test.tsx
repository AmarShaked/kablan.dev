import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { LegacyAttemptRedirect } from './LegacyAttemptRedirect';
import { LegacyProjectsPrefixRedirect } from './LegacyProjectsPrefixRedirect';
import { SettingsProjectsRedirect } from './SettingsProjectsRedirect';
import { SettingsReposRedirect } from './SettingsReposRedirect';

/** Renders the URL the router settled on, so a test can assert where a link landed. */
function Landed() {
  const { pathname, search } = useLocation();
  return <div data-testid="landed">{pathname + search}</div>;
}

/**
 * The route table, trimmed to the redirects and enough real routes to land on.
 *
 * Kept in the same order as App.tsx: the catch-all has to come last, and the legacy shapes have
 * to come after the routes they shadow.
 */
function App() {
  return (
    <Routes>
      <Route path="/local-projects" element={<Landed />} />
      <Route path="/local-projects/:projectId/tasks" element={<Landed />} />
      <Route
        path="/local-projects/:projectId/tasks/:taskId"
        element={<Landed />}
      />
      <Route
        path="/local-projects/:projectId/tasks/:taskId/full"
        element={<Landed />}
      />
      <Route
        path="/local-projects/:projectId/tasks/:taskId/attempts/:attemptId"
        element={<LegacyAttemptRedirect />}
      />
      <Route
        path="/local-projects/:projectId/tasks/:taskId/attempts/:attemptId/full"
        element={<LegacyAttemptRedirect full />}
      />
      <Route path="/projects/*" element={<LegacyProjectsPrefixRedirect />} />
      <Route path="/agents" element={<Landed />} />
      <Route path="/agents/new" element={<Landed />} />
      <Route path="/agents/:agent" element={<Landed />} />
      <Route
        path="/local-projects/:projectId/settings"
        element={<Landed />}
      />
      <Route
        path="/settings/agents"
        element={<Navigate to="/agents" replace />}
      />
      <Route
        path="/settings/usage"
        element={<Navigate to="/agents/CLAUDE_CODE" replace />}
      />
      <Route
        path="/settings/projects"
        element={<SettingsProjectsRedirect />}
      />
      <Route path="/settings/repos" element={<SettingsReposRedirect />} />
      <Route path="*" element={<Navigate to="/local-projects" replace />} />
    </Routes>
  );
}

function landOn(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <App />
    </MemoryRouter>
  );
  return screen.getByTestId('landed').textContent;
}

const P = '11111111-1111-1111-1111-111111111111';
const T = '22222222-2222-2222-2222-222222222222';
const W = '33333333-3333-3333-3333-333333333333';

describe('legacy attempt URLs', () => {
  it('sends an attempt at the task that owns it', () => {
    expect(landOn(`/local-projects/${P}/tasks/${T}/attempts/${W}`)).toBe(
      `/local-projects/${P}/tasks/${T}`
    );
  });

  it('sends attempts/latest at the same place, since that is all it ever meant', () => {
    expect(landOn(`/local-projects/${P}/tasks/${T}/attempts/latest`)).toBe(
      `/local-projects/${P}/tasks/${T}`
    );
  });

  it('keeps the query string, so ?view= still says which pane to open', () => {
    expect(
      landOn(`/local-projects/${P}/tasks/${T}/attempts/latest?view=diffs`)
    ).toBe(`/local-projects/${P}/tasks/${T}?view=diffs`);
  });

  it('keeps the full-logs page on its own route', () => {
    expect(landOn(`/local-projects/${P}/tasks/${T}/attempts/${W}/full`)).toBe(
      `/local-projects/${P}/tasks/${T}/full`
    );
  });
});

describe('the /projects prefix', () => {
  // The bug this covers: "view related tasks" navigated to /projects/... , nothing matched it,
  // and with no catch-all the app rendered a blank page.
  it('sends a related-task link at the local task, not at a blank page', () => {
    expect(landOn(`/projects/${P}/tasks/${T}/attempts/latest`)).toBe(
      `/local-projects/${P}/tasks/${T}`
    );
  });

  it('sends a project link at that project', () => {
    expect(landOn(`/projects/${P}/tasks`)).toBe(`/local-projects/${P}/tasks`);
  });
});

describe('the catch-all', () => {
  it('lands an unknown URL on the projects list rather than rendering nothing', () => {
    expect(landOn('/nonsense/path')).toBe('/local-projects');
  });
});

describe('agents routes', () => {
  it('does not send /agents at the catch-all', () => {
    expect(landOn('/agents')).toBe('/agents');
  });

  it('does not send an agent page at the catch-all', () => {
    expect(landOn('/agents/CLAUDE_CODE')).toBe('/agents/CLAUDE_CODE');
  });

  it('sends the old Settings Agents tab at /agents', () => {
    expect(landOn('/settings/agents')).toBe('/agents');
  });

  it('sends the old Usage tab at Claude’s agent page', () => {
    expect(landOn('/settings/usage')).toBe('/agents/CLAUDE_CODE');
  });
});

describe('project settings routes', () => {
  it('does not send a project settings page at the catch-all', () => {
    expect(landOn(`/local-projects/${P}/settings`)).toBe(
      `/local-projects/${P}/settings`
    );
  });

  it('sends the old Settings Projects tab at that project', () => {
    expect(landOn(`/settings/projects?projectId=${P}`)).toBe(
      `/local-projects/${P}/settings`
    );
  });

  it('sends a bare Projects tab at the projects list', () => {
    expect(landOn('/settings/projects')).toBe('/local-projects');
  });

  it('sends the old Settings Repositories tab at the projects list', () => {
    expect(landOn('/settings/repos')).toBe('/local-projects');
  });
});
