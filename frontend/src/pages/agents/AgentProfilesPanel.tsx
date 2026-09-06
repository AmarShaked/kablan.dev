import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { BaseCodingAgent, ExecutorConfigs } from 'shared/types';

import { AgentProfileForm } from '@/components/agents/AgentProfileForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/dialogs';
import { useAgentProfileMeta } from '@/hooks/useAgentProfileMeta';
import { cn } from '@/lib/utils';
import {
  createProfile,
  deleteProfile,
  nextUntitledName,
  profileFormData,
  profileNames,
  renameProfile,
  setProfileFormData,
  validateProfileName,
} from '@/utils/agentProfiles';
import { defaultProfileDescription } from '@/utils/agentProfileMeta';

type Draft = { name: string; description: string };

export function AgentProfilesPanel({
  agent,
  profiles,
  onProfilesChange,
  onSave,
  isSaving,
  saveError,
  saveSuccess,
}: {
  agent: BaseCodingAgent;
  profiles: ExecutorConfigs;
  onProfilesChange: (next: ExecutorConfigs) => void;
  onSave: (
    next: ExecutorConfigs,
    selectedName: string,
    previousName: string
  ) => Promise<void>;
  isSaving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
}) {
  const names = profileNames(profiles, agent);
  const [selected, setSelected] = useState(names[0] ?? 'DEFAULT');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const meta = useAgentProfileMeta();

  useEffect(() => {
    setDrafts({});
  }, [agent]);

  useEffect(() => {
    if (names.includes(selected)) return;
    setSelected(names[0] ?? 'DEFAULT');
  }, [names, selected]);

  const draftFor = (name: string): Draft =>
    drafts[name] ?? {
      name,
      description: meta.descriptionOf(agent, name),
    };

  const current = draftFor(selected);
  const formData = useMemo(
    () => profileFormData(profiles, agent, selected),
    [profiles, agent, selected]
  );
  const nameError = validateProfileName(current.name, names, selected);

  const patchDraft = (patch: Partial<Draft>) => {
    setDrafts((prev) => {
      const base = prev[selected] ?? {
        name: selected,
        description: meta.descriptionOf(agent, selected),
      };
      return { ...prev, [selected]: { ...base, ...patch } };
    });
  };

  const handleAdd = () => {
    const name = nextUntitledName(names);
    onProfilesChange(createProfile(profiles, agent, name, selected));
    setDrafts((prev) => ({
      ...prev,
      [name]: {
        name,
        description: defaultProfileDescription(name),
      },
    }));
    setSelected(name);
  };

  const handleSave = async () => {
    if (nameError) return;
    const trimmed = current.name.trim();
    let next = setProfileFormData(profiles, agent, selected, formData);
    if (trimmed !== selected) {
      next = renameProfile(next, agent, selected, trimmed);
      meta.rename(agent, selected, trimmed);
      setDrafts((prev) => {
        const moved = { ...prev };
        moved[trimmed] = { name: trimmed, description: current.description };
        delete moved[selected];
        return moved;
      });
    }
    meta.saveDescription(agent, trimmed, current.description);
    await onSave(next, trimmed, selected);
    setSelected(trimmed);
  };

  const handleDelete = async () => {
    if (names.length <= 1) return;
    try {
      const result = await ConfirmDialog.show({
        title: `Delete ${selected}?`,
        message: 'This profile will be removed from this agent.',
        confirmText: 'Delete profile',
        cancelText: 'Cancel',
        variant: 'destructive',
      });
      if (result !== 'confirmed') return;
    } catch {
      return;
    }
    const remaining = names.filter((name) => name !== selected);
    const next = deleteProfile(profiles, agent, selected);
    meta.remove(agent, selected);
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[selected];
      return copy;
    });
    await onSave(next, remaining[0] ?? 'DEFAULT', selected);
    setSelected(remaining[0] ?? 'DEFAULT');
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow">
      <div className="flex min-h-[32rem]">
        <aside className="flex w-44 shrink-0 flex-col border-r bg-muted/40">
          <div className="flex h-10 items-center justify-between px-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Profiles
            </span>
            <button
              type="button"
              title="New profile"
              className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              onClick={handleAdd}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="sr-only">New profile</span>
            </button>
          </div>
          <div className="space-y-0.5 px-1 pb-2">
            {names.map((name) => {
              const active = name === selected;
              const item = draftFor(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelected(name)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left',
                    active
                      ? 'bg-background text-foreground'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'w-full truncate text-xs',
                      active ? 'font-semibold' : 'font-normal'
                    )}
                  >
                    {item.name || name}
                  </span>
                  <span className="w-full truncate text-[10px] text-muted-foreground">
                    {item.description}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-6 p-5">
          {saveSuccess && (
            <Alert variant="success">
              <AlertDescription>Saved.</AlertDescription>
            </Alert>
          )}
          {saveError && (
            <Alert variant="destructive">
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          )}

          {names.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This agent has no profiles yet.
            </p>
          ) : (
            <>
              <AgentProfileForm
                agent={agent}
                name={current.name}
                description={current.description}
                nameError={nameError}
                formData={formData}
                onNameChange={(name) => patchDraft({ name })}
                onDescriptionChange={(description) =>
                  patchDraft({ description })
                }
                onFormDataChange={(next) =>
                  onProfilesChange(
                    setProfileFormData(profiles, agent, selected, next)
                  )
                }
              />
              <div className="flex items-center gap-2 border-t pt-4">
                <Button
                  onClick={() => void handleSave()}
                  disabled={isSaving || !!nameError}
                >
                  {isSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  disabled={isSaving || names.length <= 1}
                  onClick={() => void handleDelete()}
                >
                  Delete profile
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
