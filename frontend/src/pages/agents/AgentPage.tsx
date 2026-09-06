import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Loader2, Star, Trash2 } from 'lucide-react';
import { BaseCodingAgent, type ExecutorConfigs } from 'shared/types';

import { AgentIcon } from '@/components/agents/AgentIcon';
import { ConfirmDialog } from '@/components/dialogs';
import { UsageSection } from '@/components/settings/UsageSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfiguredAgents } from '@/hooks/useConfiguredAgents';
import { useProfiles } from '@/hooks/useProfiles';
import { useUserSystem } from '@/contexts/UserSystemContext';
import {
  firstAgentPath,
  parseAgentParam,
} from '@/lib/routes/agentRoutes';
import { agentLabel } from '@/utils/agentLabels';
import { AgentProfilesPanel } from '@/pages/agents/AgentProfilesPanel';
import {
  ConnectAgentEmpty,
  useConnectionCheck,
} from '@/pages/agents/ConnectAgentEmpty';

export function AgentPage() {
  const { agent: raw } = useParams<{ agent: string }>();
  const agent = parseAgentParam(raw);
  const navigate = useNavigate();
  const {
    configuredAgents,
    isLoading: agentsLoading,
    isConnected,
    removeAgent,
    refreshAgent,
  } = useConfiguredAgents();
  const {
    profilesContent,
    isLoading: profilesLoading,
    isSaving,
    error: profilesError,
    save: saveProfiles,
  } = useProfiles();
  const { config, updateAndSaveConfig, reloadSystem } = useUserSystem();

  const [localProfiles, setLocalProfiles] = useState<ExecutorConfigs | null>(
    null
  );
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (dirty || !profilesContent) return;
    try {
      setLocalProfiles(JSON.parse(profilesContent) as ExecutorConfigs);
    } catch {
      setLocalProfiles(null);
    }
  }, [profilesContent, dirty]);

  const connected = agent ? isConnected(agent) : false;
  const { checking, startChecking } = useConnectionCheck(
    agent ?? BaseCodingAgent.CLAUDE_CODE,
    refreshAgent,
    connected
  );

  if (!agent) {
    return <Navigate to="/agents" replace />;
  }

  if (agentsLoading || profilesLoading || !localProfiles) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const isDefault = config?.executor_profile?.executor === agent;
  const canRemove = configuredAgents.includes(agent)
    ? configuredAgents.length > 1
    : true;

  const handleRemove = async () => {
    try {
      const result = await ConfirmDialog.show({
        title: `Remove ${agentLabel(agent)}?`,
        message:
          'It will leave the sidebar. Profiles stay on disk if you add it again.',
        confirmText: 'Remove',
        cancelText: 'Cancel',
        variant: 'destructive',
      });
      if (result !== 'confirmed') return;
    } catch {
      return;
    }
    const remaining = configuredAgents.filter((item) => item !== agent);
    removeAgent(agent);
    navigate(firstAgentPath(remaining));
  };

  const handleMakeDefault = async () => {
    await updateAndSaveConfig({
      executor_profile: {
        executor: agent,
        variant: config?.executor_profile?.executor === agent
          ? (config.executor_profile.variant ?? 'DEFAULT')
          : 'DEFAULT',
      },
    });
    reloadSystem();
  };

  const handleSave = async (
    next: ExecutorConfigs,
    selectedName: string,
    previousName: string
  ) => {
    setSaveError(null);
    try {
      await saveProfiles(JSON.stringify(next, null, 2));
      setLocalProfiles(next);
      setDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (
        config?.executor_profile?.executor === agent &&
        config.executor_profile.variant === previousName &&
        previousName !== selectedName
      ) {
        await updateAndSaveConfig({
          executor_profile: { executor: agent, variant: selectedName },
        });
      }
      reloadSystem();
    } catch {
      setSaveError('Could not save this profile.');
    }
  };

  if (!connected) {
    return (
      <div className="p-6">
        <ConnectAgentEmpty
          agent={agent}
          checking={checking}
          onCheck={startChecking}
          onRemove={() => void handleRemove()}
          canRemove={canRemove}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      {profilesError ? (
        <p className="text-sm text-destructive">
          {profilesError instanceof Error
            ? profilesError.message
            : String(profilesError)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <AgentIcon agent={agent} className="h-5 w-5" />
        <h1 className="text-xl font-semibold">{agentLabel(agent)}</h1>
        <Badge variant="success" className="font-normal">
          Connected
        </Badge>
        {isDefault && (
          <Badge variant="outline" className="font-normal">
            Default
          </Badge>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          disabled={isDefault}
          onClick={() => void handleMakeDefault()}
        >
          <Star className="h-3.5 w-3.5" />
          Make default
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={!canRemove}
          onClick={() => void handleRemove()}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </Button>
      </div>

      {agent === BaseCodingAgent.CLAUDE_CODE && (
        <div className="rounded-xl border bg-card p-5 shadow">
          <h2 className="text-base font-semibold">Usage</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            What is left of this agent’s subscription windows, read from its
            CLI. Nothing here is saved.
          </p>
          <UsageSection />
        </div>
      )}

      <AgentProfilesPanel
        agent={agent}
        profiles={localProfiles}
        onProfilesChange={(next) => {
          setDirty(true);
          setLocalProfiles(next);
        }}
        onSave={handleSave}
        isSaving={isSaving}
        saveError={saveError}
        saveSuccess={saveSuccess}
      />
    </div>
  );
}
