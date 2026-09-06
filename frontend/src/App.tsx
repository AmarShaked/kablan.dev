import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { Projects } from '@/pages/Projects';
import { ProjectTasks } from '@/pages/ProjectTasks';
import { FullTaskLogsPage } from '@/pages/FullTaskLogs';
import { LegacyAttemptRedirect } from '@/components/routing/LegacyAttemptRedirect';
import { LegacyProjectsPrefixRedirect } from '@/components/routing/LegacyProjectsPrefixRedirect';
import { Migration } from '@/pages/Migration';
import { NormalLayout } from '@/components/layout/NormalLayout';
import { useAuth } from '@/hooks';
import { usePreviousPath } from '@/hooks/usePreviousPath';
import { useUiPreferencesScratch } from '@/hooks/useUiPreferencesScratch';

import {
  GeneralSettings,
  McpSettings,
  SettingsLayout,
} from '@/pages/settings/';
import { AgentPage } from '@/pages/agents/AgentPage';
import { AddAgentPage } from '@/pages/agents/AddAgentPage';
import { AgentsIndexRedirect } from '@/pages/agents/AgentsIndexRedirect';
import { ProjectSettingsPage } from '@/pages/projects/ProjectSettingsPage';
import { SettingsProjectsRedirect } from '@/components/routing/SettingsProjectsRedirect';
import { SettingsReposRedirect } from '@/components/routing/SettingsReposRedirect';
import {
  SETTINGS_AGENTS_REDIRECT,
  SETTINGS_USAGE_REDIRECT,
} from '@/lib/routes/agentRoutes';
import { UserSystemProvider } from '@/components/ConfigProvider';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { ThemeProvider } from '@/components/ThemeProvider';
import { SearchProvider } from '@/contexts/SearchContext';

import { HotkeysProvider } from 'react-hotkeys-hook';

import { ProjectProvider } from '@/contexts/ProjectContext';
import { useLiveInvalidation } from '@/hooks/useLiveInvalidation';
import { ThemeMode } from 'shared/types';

import { DisclaimerDialog } from '@/components/dialogs/global/DisclaimerDialog';
import { OnboardingDialog } from '@/components/dialogs/global/OnboardingDialog';
import { ReleaseNotesDialog } from '@/components/dialogs/global/ReleaseNotesDialog';
import { ClickedElementsProvider } from './contexts/ClickedElementsProvider';

// Design scope components
import { AllTasks } from '@/pages/AllTasks';
import { LegacyDesignScope } from '@/components/legacy-design/LegacyDesignScope';

function AppContent() {
  const { config, updateAndSaveConfig } = useUserSystem();
  const { isSignedIn } = useAuth();

  // Track previous path for back navigation
  usePreviousPath();

  // Sync UI preferences with server scratch storage
  useUiPreferencesScratch();

  // One socket that keeps every cached view current, wherever in the app it is.
  useLiveInvalidation();

  useEffect(() => {
    if (!config) return;
    let cancelled = false;

    const showNextStep = async () => {
      // 1) Disclaimer - first step
      if (!config.disclaimer_acknowledged) {
        await DisclaimerDialog.show();
        if (!cancelled) {
          await updateAndSaveConfig({ disclaimer_acknowledged: true });
        }
        DisclaimerDialog.hide();
        return;
      }

      // 2) Onboarding - configure executor and editor
      if (!config.onboarding_acknowledged) {
        const result = await OnboardingDialog.show();
        if (!cancelled) {
          await updateAndSaveConfig({
            onboarding_acknowledged: true,
            executor_profile: result.profile,
            editor: result.editor,
          });
        }
        OnboardingDialog.hide();
        return;
      }

      // 3) Release notes - last step
      if (config.show_release_notes) {
        await ReleaseNotesDialog.show();
        if (!cancelled) {
          await updateAndSaveConfig({ show_release_notes: false });
        }
        ReleaseNotesDialog.hide();
        return;
      }
    };

    showNextStep();

    return () => {
      cancelled = true;
    };
  }, [config, isSignedIn, updateAndSaveConfig]);

  // TODO: Disabled while developing FE only
  // if (loading) {
  //   return (
  //     <div className="min-h-screen bg-background flex items-center justify-center">
  //       <Loader message="Loading..." size={32} />
  //     </div>
  //   );
  // }

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider initialTheme={config?.theme || ThemeMode.SYSTEM}>
        <SearchProvider>
          <Routes>
            {/* ========== LEGACY DESIGN ROUTES ========== */}
            {/* VS Code full-page logs route (outside NormalLayout for minimal UI) */}
            <Route
              path="/local-projects/:projectId/tasks/:taskId/full"
              element={
                <LegacyDesignScope>
                  <FullTaskLogsPage />
                </LegacyDesignScope>
              }
            />
            <Route
              path="/local-projects/:projectId/tasks/:taskId/attempts/:attemptId/full"
              element={<LegacyAttemptRedirect full />}
            />

            <Route
              element={
                <LegacyDesignScope>
                  <NormalLayout />
                </LegacyDesignScope>
              }
            >
              <Route path="/" element={<Projects />} />
              <Route path="/tasks" element={<AllTasks />} />
              <Route path="/local-projects" element={<Projects />} />
              <Route path="/local-projects/:projectId" element={<Projects />} />
              <Route path="/migration" element={<Migration />} />
              <Route
                path="/local-projects/:projectId/tasks"
                element={<ProjectTasks />}
              />
              <Route
                path="/local-projects/:projectId/settings"
                element={<ProjectSettingsPage />}
              />
              <Route path="/settings/*" element={<SettingsLayout />}>
                <Route index element={<Navigate to="general" replace />} />
                <Route path="general" element={<GeneralSettings />} />
                <Route
                  path="projects"
                  element={<SettingsProjectsRedirect />}
                />
                <Route path="repos" element={<SettingsReposRedirect />} />
                <Route
                  path="agents"
                  element={
                    <Navigate to={SETTINGS_AGENTS_REDIRECT} replace />
                  }
                />
                <Route path="mcp" element={<McpSettings />} />
                <Route
                  path="usage"
                  element={
                    <Navigate to={SETTINGS_USAGE_REDIRECT} replace />
                  }
                />
              </Route>
              <Route
                path="/mcp-servers"
                element={<Navigate to="/settings/mcp" replace />}
              />
              <Route path="/agents" element={<AgentsIndexRedirect />} />
              <Route path="/agents/new" element={<AddAgentPage />} />
              <Route path="/agents/:agent" element={<AgentPage />} />
              <Route
                path="/local-projects/:projectId/tasks/:taskId"
                element={<ProjectTasks />}
              />
              <Route
                path="/local-projects/:projectId/tasks/:taskId/attempts/:attemptId"
                element={<LegacyAttemptRedirect />}
              />
              {/* Links to the shorter prefix were built in a few places and shipped. */}
              <Route
                path="/projects/*"
                element={<LegacyProjectsPrefixRedirect />}
              />
              {/* Without this, an unmatched route renders nothing and the app looks crashed.
                  Any URL we cannot place lands on the projects list instead of a blank page. */}
              <Route
                path="*"
                element={<Navigate to="/local-projects" replace />}
              />
            </Route>
          </Routes>
        </SearchProvider>
      </ThemeProvider>
    </I18nextProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <UserSystemProvider>
        <ClickedElementsProvider>
          <ProjectProvider>
            <HotkeysProvider
              initiallyActiveScopes={[
                'global',
                'workspace',
                'kanban',
                'projects',
              ]}
            >
              <AppContent />
            </HotkeysProvider>
          </ProjectProvider>
        </ClickedElementsProvider>
      </UserSystemProvider>
    </BrowserRouter>
  );
}

export default App;
