import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SpinnerIcon,
  PlusIcon,
  TrashIcon,
  DotsThreeIcon,
  StarIcon,
} from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../primitives/Dropdown';
import { ExecutorConfigForm } from './ExecutorConfigForm';
import { useProfiles } from '@/hooks/useProfiles';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { CreateConfigurationDialog } from '@/components/dialogs/settings/CreateConfigurationDialog';
import { DeleteConfigurationDialog } from '@/components/dialogs/settings/DeleteConfigurationDialog';
import { AddAgentWizardDialog } from '@/components/dialogs/settings/AddAgentWizardDialog';
import { ConfirmDialog } from '@/components/dialogs';
import type { BaseCodingAgent, ExecutorConfigs } from 'shared/types';
import { cn } from '@/lib/utils';
import { toPrettyCase } from '@/utils/string';
import { agentLabel } from '@/utils/agentLabels';
import {
  SettingsSaveBar,
  SettingsSelect,
  TwoColumnPickerBadge,
} from './SettingsComponents';
import { useSettingsDirty } from './SettingsDirtyContext';
import { AgentIcon } from '@/components/agents/AgentIcon';
import { PrimaryButton } from '../../primitives/PrimaryButton';
import { useConfiguredAgents } from '@/hooks/useConfiguredAgents';

type ExecutorsMap = Record<string, Record<string, Record<string, unknown>>>;

export function AgentsSettingsSection() {
  const { t } = useTranslation(['settings', 'common']);
  const { setDirty: setContextDirty } = useSettingsDirty();
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
  const [selectedConfiguration, setSelectedConfiguration] = useState<
    string | null
  >(null);
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
        const parsed = JSON.parse(serverProfilesContent);
        setLocalParsedProfiles(parsed);
      } catch (err) {
        console.error('Failed to parse profiles JSON:', err);
        setLocalParsedProfiles(null);
      }
    }
  }, [serverProfilesContent, isDirty]);

  useEffect(() => {
    setContextDirty('agents', isDirty);
    return () => setContextDirty('agents', false);
  }, [isDirty, setContextDirty]);

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
      // User cancelled
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
      // User cancelled
    }
  };

  const createConfiguration = (
    executorType: string,
    configName: string,
    baseConfig?: string | null
  ) => {
    if (!localParsedProfiles || !localParsedProfiles.executors) return;

    const executorsMap =
      localParsedProfiles.executors as unknown as ExecutorsMap;
    const base =
      baseConfig && executorsMap[executorType]?.[baseConfig]?.[executorType]
        ? executorsMap[executorType][baseConfig][executorType]
        : {};

    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [executorType]: {
          ...executorsMap[executorType],
          [configName]: {
            [executorType]: base,
          },
        },
      },
    };

    markDirty(updatedProfiles);
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
      // User cancelled
    }
  };

  const deleteConfiguration = async (
    executorType: string,
    configToDelete: string
  ) => {
    if (!localParsedProfiles) return;

    setSaveError(null);

    try {
      const executorConfigs =
        localParsedProfiles.executors[executorType as BaseCodingAgent];
      if (!executorConfigs?.[configToDelete]) {
        return;
      }

      const currentConfigs = Object.keys(executorConfigs);
      if (currentConfigs.length <= 1) {
        return;
      }

      const remainingConfigs = { ...executorConfigs };
      delete remainingConfigs[configToDelete];

      const updatedProfiles = {
        ...localParsedProfiles,
        executors: {
          ...localParsedProfiles.executors,
          [executorType]: remainingConfigs,
        },
      };

      const executorsMap = updatedProfiles.executors as unknown as ExecutorsMap;
      if (Object.keys(remainingConfigs).length === 0) {
        executorsMap[executorType] = {
          DEFAULT: { [executorType]: {} },
        };
      }

      try {
        await saveProfiles(JSON.stringify(updatedProfiles, null, 2));
        setLocalParsedProfiles(updatedProfiles);
        setIsDirty(false);

        if (
          selectedExecutorType === executorType &&
          selectedConfiguration === configToDelete
        ) {
          const nextConfigs = Object.keys(executorsMap[executorType] || {});
          setSelectedConfiguration(nextConfigs[0] || 'DEFAULT');
        }

        setProfilesSuccess(true);
        setTimeout(() => setProfilesSuccess(false), 3000);
        reloadSystem();
      } catch (error: unknown) {
        console.error('Failed to save deletion to backend:', error);
        setSaveError(t('settings.agents.errors.deleteFailed'));
      }
    } catch (error) {
      console.error('Error deleting configuration:', error);
    }
  };

  const handleMakeDefault = async (executor: string, configName: string) => {
    try {
      await updateAndSaveConfig({
        executor_profile: {
          executor: executor as BaseCodingAgent,
          variant: configName,
        },
      });
      reloadSystem();
    } catch (err) {
      console.error('Error setting default:', err);
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
    if (selectedExecutorType === executor) {
      const remaining = configuredAgents.filter((agent) => agent !== executor);
      setSelectedExecutorType(remaining[0] ?? null);
      setSelectedConfiguration('DEFAULT');
    }
  };

  const handleExecutorConfigChange = (
    executorType: string,
    configuration: string,
    formData: unknown
  ) => {
    if (!localParsedProfiles || !localParsedProfiles.executors) return;

    const executorsMap =
      localParsedProfiles.executors as unknown as ExecutorsMap;
    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [executorType]: {
          ...executorsMap[executorType],
          [configuration]: {
            [executorType]: formData,
          },
        },
      },
    };

    markDirty(updatedProfiles);
  };

  const handleExecutorConfigSave = async (formData: unknown) => {
    if (
      !localParsedProfiles ||
      !localParsedProfiles.executors ||
      !selectedExecutorType ||
      !selectedConfiguration
    )
      return;

    setSaveError(null);

    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [selectedExecutorType]: {
          ...localParsedProfiles.executors[selectedExecutorType],
          [selectedConfiguration]: {
            [selectedExecutorType]: formData,
          },
        },
      },
    };

    setLocalParsedProfiles(updatedProfiles);

    try {
      await saveProfiles(JSON.stringify(updatedProfiles, null, 2));
      setProfilesSuccess(true);
      setIsDirty(false);
      setTimeout(() => setProfilesSuccess(false), 3000);
      reloadSystem();
    } catch (err: unknown) {
      console.error('Failed to save profiles:', err);
      setSaveError(t('settings.agents.errors.saveConfigFailed'));
    }
  };

  const handleSave = async () => {
    if (
      isDirty &&
      localParsedProfiles &&
      selectedExecutorType &&
      selectedConfiguration
    ) {
      const executorsMap =
        localParsedProfiles.executors as unknown as ExecutorsMap;
      const formData =
        executorsMap[selectedExecutorType]?.[selectedConfiguration]?.[
          selectedExecutorType
        ];
      if (formData) {
        await handleExecutorConfigSave(formData);
      }
    }
  };

  const handleDiscard = () => {
    if (isDirty && serverProfilesContent) {
      setIsDirty(false);
      try {
        const parsed = JSON.parse(serverProfilesContent);
        setLocalParsedProfiles(parsed);
      } catch {
        // Ignore parse errors on discard
      }
    }
  };

  if (profilesLoading || agentsLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <SpinnerIcon
          className="size-icon-lg animate-spin text-brand"
          weight="bold"
        />
        <span className="text-normal">{t('settings.agents.loading')}</span>
      </div>
    );
  }

  const executorsMap =
    localParsedProfiles?.executors as unknown as ExecutorsMap;
  const selectedConfigs = selectedExecutorType
    ? Object.keys(localParsedProfiles?.executors?.[selectedExecutorType] || {})
    : [];

  return (
    <>
      {!!profilesError && (
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error mb-4">
          {profilesError instanceof Error
            ? profilesError.message
            : String(profilesError)}
        </div>
      )}

      {profilesSuccess && (
        <div className="bg-success/10 border border-success/50 rounded-sm p-4 text-success font-medium mb-4">
          {t('settings.agents.save.success')}
        </div>
      )}

      {saveError && (
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error mb-4">
          {saveError}
        </div>
      )}

      {configuredAgents.length > 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-low">{t('settings.agents.description')}</p>
          <div className="flex items-end gap-2 border-b border-border">
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
                      'flex items-center gap-half shrink-0 px-base py-half text-sm border-b-2 -mb-px transition-colors',
                      selected
                        ? 'border-brand text-high font-medium'
                        : 'border-transparent text-low hover:text-normal'
                    )}
                    onClick={() => {
                      setSelectedExecutorType(executor);
                      const configs = Object.keys(
                        localParsedProfiles?.executors?.[executor] || {}
                      );
                      setSelectedConfiguration(configs[0] || 'DEFAULT');
                    }}
                  >
                    <AgentIcon
                      agent={executor}
                      className="size-icon-sm shrink-0"
                    />
                    <span className="truncate">{agentLabel(executor)}</span>
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full shrink-0',
                        connected ? 'bg-success' : 'bg-low/40'
                      )}
                    />
                  </button>
                );
              })}
            </div>
            <PrimaryButton
              variant="tertiary"
              value={t('settings.agents.addAgent')}
              actionIcon={PlusIcon}
              onClick={handleAddAgent}
              className="mb-1.5 shrink-0"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-low">{t('settings.agents.description')}</p>
          <div className="border border-border rounded-sm px-base py-plusfifty text-sm text-low text-center">
            {t('settings.agents.empty')}
          </div>
          <PrimaryButton
            value={t('settings.agents.addAgent')}
            actionIcon={PlusIcon}
            onClick={handleAddAgent}
          />
        </div>
      )}

      {selectedExecutorType && selectedConfigs.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-half text-xs text-low">
              <span>
                {isConnected(selectedExecutorType)
                  ? t('settings.agents.connected')
                  : t('settings.agents.notConnected')}
              </span>
              {config?.executor_profile?.executor === selectedExecutorType && (
                <TwoColumnPickerBadge variant="brand">
                  {t('settings.agents.editor.isDefault')}
                </TwoColumnPickerBadge>
              )}
            </div>
            <AgentActionsDropdown
              executorType={selectedExecutorType}
              isDefault={
                config?.executor_profile?.executor === selectedExecutorType
              }
              canRemove={configuredAgents.length > 1}
              defaultConfig={
                config?.executor_profile?.executor === selectedExecutorType
                  ? (config?.executor_profile?.variant ?? 'DEFAULT')
                  : 'DEFAULT'
              }
              onMakeDefault={handleMakeDefault}
              onRemove={handleRemoveAgent}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SettingsSelect
                value={selectedConfiguration ?? 'DEFAULT'}
                options={selectedConfigs.map((configName) => ({
                  value: configName,
                  label: toPrettyCase(configName),
                }))}
                onChange={setSelectedConfiguration}
              />
            </div>
            <button
              className="p-half rounded-sm hover:bg-secondary text-low hover:text-normal"
              onClick={() => handleCreateConfig(selectedExecutorType)}
              disabled={profilesSaving}
              title={t('settings.agents.editor.createNew')}
            >
              <PlusIcon className="size-icon-2xs" weight="bold" />
            </button>
            <ConfigActionsDropdown
              executorType={selectedExecutorType}
              configName={selectedConfiguration ?? 'DEFAULT'}
              isDefault={
                config?.executor_profile?.executor === selectedExecutorType &&
                (config?.executor_profile?.variant ?? 'DEFAULT') ===
                  (selectedConfiguration ?? 'DEFAULT')
              }
              configCount={selectedConfigs.length}
              onMakeDefault={handleMakeDefault}
              onDelete={handleDeleteConfig}
            />
          </div>

          <div className="bg-secondary/50 border border-border rounded-sm p-4">
            <ExecutorConfigForm
              key={`${selectedExecutorType}-${selectedConfiguration}`}
              executor={selectedExecutorType}
              value={
                (executorsMap?.[selectedExecutorType]?.[
                  selectedConfiguration ?? 'DEFAULT'
                ]?.[selectedExecutorType] as Record<string, unknown>) || {}
              }
              onChange={(formData) =>
                handleExecutorConfigChange(
                  selectedExecutorType,
                  selectedConfiguration ?? 'DEFAULT',
                  formData
                )
              }
              disabled={profilesSaving}
            />
          </div>
        </div>
      ) : null}

      <SettingsSaveBar
        show={isDirty}
        saving={profilesSaving}
        saveDisabled={!!profilesError}
        unsavedMessage={t('settings.agents.save.unsavedChanges')}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </>
  );
}

function AgentActionsDropdown({
  executorType,
  isDefault,
  canRemove,
  defaultConfig,
  onMakeDefault,
  onRemove,
}: {
  executorType: BaseCodingAgent;
  isDefault: boolean;
  canRemove: boolean;
  defaultConfig: string;
  onMakeDefault: (executor: string, config: string) => void;
  onRemove: (executor: BaseCodingAgent) => void;
}) {
  const { t } = useTranslation(['settings']);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'p-half rounded-sm hover:bg-panel text-low hover:text-normal'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <DotsThreeIcon className="size-icon-xs" weight="bold" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onMakeDefault(executorType, defaultConfig);
          }}
          disabled={isDefault}
        >
          <div className="flex items-center gap-half w-full">
            <StarIcon className="size-icon-xs mr-base" />
            {t('settings.agents.editor.makeDefault')}
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onRemove(executorType);
          }}
          disabled={!canRemove}
          className="text-error focus:text-error"
        >
          <div className="flex items-center gap-half w-full">
            <TrashIcon className="size-icon-xs mr-base" />
            {t('settings.agents.removeAgent')}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConfigActionsDropdown({
  executorType,
  configName,
  isDefault,
  configCount,
  onMakeDefault,
  onDelete,
}: {
  executorType: BaseCodingAgent;
  configName: string;
  isDefault: boolean;
  configCount: number;
  onMakeDefault: (executor: string, config: string) => void;
  onDelete: (executor: string, config: string) => void;
}) {
  const { t } = useTranslation(['settings']);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-half rounded-sm hover:bg-panel text-low hover:text-normal"
          onClick={(e) => e.stopPropagation()}
        >
          <DotsThreeIcon className="size-icon-xs" weight="bold" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onMakeDefault(executorType, configName);
          }}
          disabled={isDefault}
        >
          <div className="flex items-center gap-half w-full">
            <StarIcon className="size-icon-xs mr-base" />
            {t('settings.agents.editor.makeDefault')}
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onDelete(executorType, configName);
          }}
          disabled={configCount <= 1}
          className="text-error focus:text-error"
        >
          <div className="flex items-center gap-half w-full">
            <TrashIcon className="size-icon-xs mr-base" />
            {t('settings.agents.editor.deleteText')}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { AgentsSettingsSection as AgentsSettingsSectionContent };
