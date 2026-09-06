import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { ExecutorConfigForm } from '@/components/ExecutorConfigForm';
import { useProfiles } from '@/hooks/useProfiles';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { CreateConfigurationDialog } from '@/components/dialogs/settings/CreateConfigurationDialog';
import { DeleteConfigurationDialog } from '@/components/dialogs/settings/DeleteConfigurationDialog';
import { AddAgentWizardDialog } from '@/components/dialogs/settings/AddAgentWizardDialog';
import { ConfirmDialog } from '@/components/dialogs';
import { useConfiguredAgents } from '@/hooks/useConfiguredAgents';
import { AgentIcon } from '@/components/agents/AgentIcon';
import { agentLabel } from '@/utils/agentLabels';
import { cn } from '@/lib/utils';
import type { BaseCodingAgent, ExecutorConfigs } from 'shared/types';

type ExecutorsMap = Record<string, Record<string, Record<string, unknown>>>;

export function AgentSettings() {
  const { t } = useTranslation(['settings', 'common']);
  const {
    configuredAgents,
    unconfiguredAgents,
    availability,
    isLoading: agentsLoading,
    addAgent,
    removeAgent,
    isConnected,
  } = useConfiguredAgents();

  const {
    profilesContent: serverProfilesContent,
    isLoading: profilesLoading,
    isSaving: profilesSaving,
    error: profilesError,
    save: saveProfiles,
  } = useProfiles();

  const { config, updateAndSaveConfig, reloadSystem } = useUserSystem();

  const [profilesSuccess, setProfilesSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedExecutorType, setSelectedExecutorType] =
    useState<BaseCodingAgent | null>(null);
  const [selectedConfiguration, setSelectedConfiguration] =
    useState<string>('DEFAULT');
  const [localParsedProfiles, setLocalParsedProfiles] =
    useState<ExecutorConfigs | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (selectedExecutorType) return;
    if (config?.executor_profile?.executor) {
      setSelectedExecutorType(config.executor_profile.executor);
      setSelectedConfiguration(config.executor_profile.variant || 'DEFAULT');
      return;
    }
    if (configuredAgents[0]) {
      setSelectedExecutorType(configuredAgents[0]);
    }
  }, [config?.executor_profile, selectedExecutorType, configuredAgents]);

  useEffect(() => {
    if (!isDirty && serverProfilesContent) {
      try {
        setLocalParsedProfiles(JSON.parse(serverProfilesContent));
      } catch (err) {
        console.error('Failed to parse profiles JSON:', err);
        setLocalParsedProfiles(null);
      }
    }
  }, [serverProfilesContent, isDirty]);

  const markDirty = (nextProfiles: unknown) => {
    setLocalParsedProfiles(nextProfiles as ExecutorConfigs);
    setIsDirty(true);
  };

  const handleCreateConfig = async (executor: string) => {
    try {
      const result = await CreateConfigurationDialog.show({
        executorType: executor as BaseCodingAgent,
        existingConfigs: Object.keys(
          localParsedProfiles?.executors?.[executor as BaseCodingAgent] || {}
        ),
      });
      if (result.action === 'created' && result.configName) {
        createConfiguration(executor, result.configName, result.cloneFrom);
      }
    } catch {
      // cancelled
    }
  };

  const handleAddAgent = async () => {
    try {
      const result = await AddAgentWizardDialog.show({
        candidates: unconfiguredAgents,
        availability,
      });
      if (result.action === 'added' && result.agent) {
        addAgent(result.agent);
        setSelectedExecutorType(result.agent);
        setSelectedConfiguration('DEFAULT');
      }
    } catch {
      // cancelled
    }
  };

  const createConfiguration = (
    executorType: string,
    configName: string,
    baseConfig?: string | null
  ) => {
    if (!localParsedProfiles?.executors) return;
    const executorsMap =
      localParsedProfiles.executors as unknown as ExecutorsMap;
    const base =
      baseConfig && executorsMap[executorType]?.[baseConfig]?.[executorType]
        ? executorsMap[executorType][baseConfig][executorType]
        : {};
    markDirty({
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [executorType]: {
          ...executorsMap[executorType],
          [configName]: { [executorType]: base },
        },
      },
    });
    setSelectedExecutorType(executorType as BaseCodingAgent);
    setSelectedConfiguration(configName);
  };

  const handleDeleteConfig = async (executor: string, configName: string) => {
    try {
      const result = await DeleteConfigurationDialog.show({
        configName,
        executorType: executor as BaseCodingAgent,
      });
      if (result === 'deleted') {
        await deleteConfiguration(executor, configName);
      }
    } catch {
      // cancelled
    }
  };

  const deleteConfiguration = async (
    executorType: string,
    configToDelete: string
  ) => {
    if (!localParsedProfiles) return;
    const executorConfigs =
      localParsedProfiles.executors[executorType as BaseCodingAgent];
    if (!executorConfigs?.[configToDelete]) return;
    if (Object.keys(executorConfigs).length <= 1) return;

    const remainingConfigs = { ...executorConfigs };
    delete remainingConfigs[configToDelete];
    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [executorType]: remainingConfigs,
      },
    };
    try {
      await saveProfiles(JSON.stringify(updatedProfiles, null, 2));
      setLocalParsedProfiles(updatedProfiles);
      setIsDirty(false);
      if (
        selectedExecutorType === executorType &&
        selectedConfiguration === configToDelete
      ) {
        setSelectedConfiguration(Object.keys(remainingConfigs)[0] || 'DEFAULT');
      }
      setProfilesSuccess(true);
      setTimeout(() => setProfilesSuccess(false), 3000);
      reloadSystem();
    } catch {
      setSaveError(t('settings.agents.errors.deleteFailed'));
    }
  };

  const handleRemoveAgent = async (executor: BaseCodingAgent) => {
    try {
      const result = await ConfirmDialog.show({
        title: t('settings.agents.removeConfirm.title', {
          agent: agentLabel(executor),
        }),
        message: t('settings.agents.removeConfirm.message'),
        confirmText: t('settings.agents.removeAgent'),
        cancelText: t('common:buttons.cancel'),
        variant: 'destructive',
      });
      if (result !== 'confirmed') return;
    } catch {
      return;
    }
    removeAgent(executor);
    const remaining = configuredAgents.filter((agent) => agent !== executor);
    setSelectedExecutorType(remaining[0] ?? null);
    setSelectedConfiguration('DEFAULT');
  };

  const handleMakeDefault = async (executor: string, configName: string) => {
    await updateAndSaveConfig({
      executor_profile: {
        executor: executor as BaseCodingAgent,
        variant: configName,
      },
    });
    reloadSystem();
  };

  const handleExecutorConfigChange = (
    executorType: string,
    configuration: string,
    formData: unknown
  ) => {
    if (!localParsedProfiles?.executors) return;
    const executorsMap =
      localParsedProfiles.executors as unknown as ExecutorsMap;
    markDirty({
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [executorType]: {
          ...executorsMap[executorType],
          [configuration]: { [executorType]: formData },
        },
      },
    });
  };

  const handleSave = async () => {
    if (!localParsedProfiles) return;
    setSaveError(null);
    try {
      await saveProfiles(JSON.stringify(localParsedProfiles, null, 2));
      setProfilesSuccess(true);
      setIsDirty(false);
      setTimeout(() => setProfilesSuccess(false), 3000);
      reloadSystem();
    } catch {
      setSaveError(t('settings.agents.errors.saveConfigFailed'));
    }
  };

  if (profilesLoading || agentsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">{t('settings.agents.loading')}</span>
      </div>
    );
  }

  const executorsMap =
    localParsedProfiles?.executors as unknown as ExecutorsMap;
  const selectedConfigs = selectedExecutorType
    ? Object.keys(localParsedProfiles?.executors?.[selectedExecutorType] || {})
    : [];

  return (
    <div className="space-y-6">
      {!!profilesError && (
        <Alert variant="destructive">
          <AlertDescription>
            {profilesError instanceof Error
              ? profilesError.message
              : String(profilesError)}
          </AlertDescription>
        </Alert>
      )}
      {profilesSuccess && (
        <Alert variant="success">
          <AlertDescription className="font-medium">
            {t('settings.agents.save.success')}
          </AlertDescription>
        </Alert>
      )}
      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.agents.title')}</CardTitle>
          <CardDescription>{t('settings.agents.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2 border-b">
            <div
              role="tablist"
              aria-label={t('settings.agents.title')}
              className="flex min-w-0 flex-1 flex-wrap items-stretch gap-1"
            >
            {configuredAgents.map((executor) => {
              const selected = selectedExecutorType === executor;
              const connected = isConnected(executor);
              return (
                <button
                  key={executor}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={cn(
                    'flex items-center gap-2 shrink-0 px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
                    selected
                      ? 'border-primary text-foreground font-medium'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => {
                    setSelectedExecutorType(executor);
                    const configs = Object.keys(
                      localParsedProfiles?.executors?.[executor] || {}
                    );
                    setSelectedConfiguration(configs[0] || 'DEFAULT');
                  }}
                >
                  <AgentIcon agent={executor} className="h-4 w-4 shrink-0" />
                  <span className="truncate">{agentLabel(executor)}</span>
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full shrink-0',
                      connected ? 'bg-green-500' : 'bg-muted-foreground/40'
                    )}
                    title={
                      connected
                        ? t('settings.agents.connected')
                        : t('settings.agents.notConnected')
                    }
                  />
                </button>
              );
            })}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mb-1.5 shrink-0"
              onClick={handleAddAgent}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t('settings.agents.addAgent')}
            </Button>
          </div>

          {configuredAgents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t('settings.agents.empty')}
            </p>
          ) : selectedExecutorType ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-muted-foreground">
                    {isConnected(selectedExecutorType)
                      ? t('settings.agents.connected')
                      : t('settings.agents.notConnected')}
                  </span>
                  {config?.executor_profile?.executor ===
                    selectedExecutorType && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      {t('settings.agents.editor.isDefault')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      config?.executor_profile?.executor ===
                      selectedExecutorType
                    }
                    onClick={() =>
                      handleMakeDefault(selectedExecutorType, 'DEFAULT')
                    }
                  >
                    <Star className="mr-1.5 h-3.5 w-3.5" />
                    {t('settings.agents.editor.makeDefault')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={configuredAgents.length <= 1}
                    onClick={() => handleRemoveAgent(selectedExecutorType)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    {t('settings.agents.removeAgent')}
                  </Button>
                </div>
              </div>

              {selectedConfigs.length > 0 && (
                <>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="configuration">
                        {t('settings.agents.editor.configLabel')}
                      </Label>
                      <Select
                        value={selectedConfiguration}
                        onValueChange={(value) => {
                          if (value === '__create__') {
                            handleCreateConfig(selectedExecutorType);
                          } else {
                            setSelectedConfiguration(value);
                          }
                        }}
                      >
                        <SelectTrigger id="configuration">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedConfigs.map((configuration) => (
                            <SelectItem
                              key={configuration}
                              value={configuration}
                            >
                              {configuration}
                            </SelectItem>
                          ))}
                          <SelectItem value="__create__">
                            {t('settings.agents.editor.createNew')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button
                        variant="destructive"
                        disabled={profilesSaving || selectedConfigs.length <= 1}
                        onClick={() =>
                          handleDeleteConfig(
                            selectedExecutorType,
                            selectedConfiguration
                          )
                        }
                      >
                        {t('settings.agents.editor.deleteText')}
                      </Button>
                    </div>
                  </div>

                  {!!executorsMap?.[selectedExecutorType]?.[
                    selectedConfiguration
                  ]?.[selectedExecutorType] && (
                    <ExecutorConfigForm
                      key={`${selectedExecutorType}-${selectedConfiguration}`}
                      executor={selectedExecutorType}
                      value={
                        (executorsMap[selectedExecutorType][
                          selectedConfiguration
                        ][selectedExecutorType] as Record<string, unknown>) ||
                        {}
                      }
                      onChange={(formData) =>
                        handleExecutorConfigChange(
                          selectedExecutorType,
                          selectedConfiguration,
                          formData
                        )
                      }
                      onSave={handleSave}
                      disabled={profilesSaving}
                      isSaving={profilesSaving}
                      isDirty={isDirty}
                    />
                  )}
                </>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

