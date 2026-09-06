import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isEqual } from 'lodash';
import { Loader2, Plus } from 'lucide-react';
import type { Repo, UpdateRepo } from 'shared/types';

import { ConfirmDialog } from '@/components/dialogs';
import { RepoPickerDialog } from '@/components/dialogs/shared/RepoPickerDialog';
import BranchSelector from '@/components/tasks/BranchSelector';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AutoExpandingTextarea } from '@/components/ui/auto-expanding-textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiFileSearchTextarea } from '@/components/ui/multi-file-search-textarea';
import { Switch } from '@/components/ui/switch';
import { repoBranchKeys, useRepoBranches } from '@/hooks/useRepoBranches';
import { useScriptPlaceholders } from '@/hooks/useScriptPlaceholders';
import { projectsApi, repoApi } from '@/lib/api';
import { repoKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';

type Draft = {
  display_name: string;
  setup_script: string;
  parallel_setup_script: boolean;
  cleanup_script: string;
  copy_files: string;
  dev_server_script: string;
  default_working_dir: string;
  default_target_branch: string;
};

const codeFieldClass =
  'rounded-md border border-input bg-background px-3 py-2 font-mono';

function repoToDraft(repo: Repo): Draft {
  return {
    display_name: repo.display_name,
    setup_script: repo.setup_script ?? '',
    parallel_setup_script: repo.parallel_setup_script,
    cleanup_script: repo.cleanup_script ?? '',
    copy_files: repo.copy_files ?? '',
    dev_server_script: repo.dev_server_script ?? '',
    default_working_dir: repo.default_working_dir ?? '',
    default_target_branch: repo.default_target_branch ?? '',
  };
}

function ConfigField({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id}>{label}</Label>
        {hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}

export function ProjectReposPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const placeholders = useScriptPlaceholders();
  const [searchParams, setSearchParams] = useSearchParams();
  const repoFromUrl = searchParams.get('repo');

  const [repositories, setRepositories] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    projectsApi
      .getRepositories(projectId)
      .then(setRepositories)
      .catch((err) => {
        setLoadError(
          err instanceof Error ? err.message : 'Failed to load repositories'
        );
        setRepositories([]);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const selected =
    (repoFromUrl && repositories.some((r) => r.id === repoFromUrl)
      ? repoFromUrl
      : repositories[0]?.id) ?? null;

  const repo = repositories.find((r) => r.id === selected) ?? null;
  const draft = useMemo(() => {
    if (!repo) return null;
    return drafts[repo.id] ?? repoToDraft(repo);
  }, [drafts, repo]);

  const dirty = useMemo(() => {
    if (!repo || !draft) return false;
    return !isEqual(draft, repoToDraft(repo));
  }, [draft, repo]);

  const { data: branches = [], isLoading: branchesLoading } = useRepoBranches(
    selected,
    { enabled: !!selected }
  );

  const selectRepo = async (id: string) => {
    if (id === selected) return;
    if (dirty) {
      const result = await ConfirmDialog.show({
        title: 'Unsaved changes',
        message:
          'This repository has unsaved changes. Switch anyway and discard them?',
        confirmText: 'Discard',
        variant: 'destructive',
      }).catch(() => 'canceled');
      if (result !== 'confirmed') return;
      if (selected) {
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[selected];
          return next;
        });
      }
    }
    setSearchParams({ repo: id }, { replace: true });
    setSaveSuccess(false);
    setSaveError(null);
  };

  const patchDraft = (updates: Partial<Draft>) => {
    if (!repo) return;
    setDrafts((prev) => {
      const base = prev[repo.id] ?? repoToDraft(repo);
      return { ...prev, [repo.id]: { ...base, ...updates } };
    });
  };

  const handleAdd = async () => {
    const picked = await RepoPickerDialog.show({
      title: 'Select Git Repository',
      description: 'Choose a git repository to add to this project',
    });
    if (!picked) return;
    if (repositories.some((r) => r.id === picked.id)) {
      setSearchParams({ repo: picked.id }, { replace: true });
      return;
    }

    setAdding(true);
    setLoadError(null);
    try {
      const created = await projectsApi.addRepository(projectId, {
        display_name: picked.display_name,
        git_repo_path: picked.path,
      });
      setRepositories((prev) => [...prev, created]);
      queryClient.invalidateQueries({ queryKey: repoKeys.all });
      queryClient.invalidateQueries({
        queryKey: repoBranchKeys.byRepo(created.id),
      });
      setSearchParams({ repo: created.id }, { replace: true });
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to add repository'
      );
    } finally {
      setAdding(false);
    }
  };

  const handleSave = async () => {
    if (!repo || !draft) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const updateData: UpdateRepo = {
        display_name: draft.display_name.trim() || null,
        setup_script: draft.setup_script.trim() || null,
        cleanup_script: draft.cleanup_script.trim() || null,
        copy_files: draft.copy_files.trim() || null,
        parallel_setup_script: draft.parallel_setup_script,
        dev_server_script: draft.dev_server_script.trim() || null,
        default_working_dir: draft.default_working_dir.trim() || null,
        default_target_branch: draft.default_target_branch.trim() || null,
      };
      const updated = await repoApi.update(repo.id, updateData);
      setRepositories((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[updated.id];
        return next;
      });
      queryClient.setQueryData(repoKeys.all, (old: Repo[] | undefined) =>
        old?.map((item) => (item.id === updated.id ? updated : item))
      );
      queryClient.invalidateQueries({ queryKey: repoKeys.all });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Could not save this repository.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!repo) return;
    const confirmName =
      (draft?.display_name.trim() || repo.display_name || repo.name).trim();
    try {
      const result = await ConfirmDialog.show({
        title: `Remove ${confirmName}?`,
        message:
          'It will leave this project. The checkout on disk is left alone.',
        confirmText: 'Remove',
        variant: 'destructive',
        typedValue: confirmName,
      });
      if (result !== 'confirmed') return;
    } catch {
      return;
    }

    try {
      await projectsApi.deleteRepository(projectId, repo.id);
      const remaining = repositories.filter((item) => item.id !== repo.id);
      setRepositories(remaining);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: repoKeys.all });
      queryClient.invalidateQueries({
        queryKey: repoBranchKeys.byRepo(repo.id),
      });
      if (remaining[0]) {
        setSearchParams({ repo: remaining[0].id }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to remove repository'
      );
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow">
      <div className="flex min-h-[32rem]">
        <aside className="flex w-44 shrink-0 flex-col border-r bg-muted/40">
          <div className="flex h-10 items-center justify-between px-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Repositories
            </span>
            <button
              type="button"
              title="Add repository"
              className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              disabled={adding}
              onClick={() => void handleAdd()}
            >
              {adding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              <span className="sr-only">Add repository</span>
            </button>
          </div>
          <div className="space-y-0.5 px-1 pb-2">
            {repositories.map((item) => {
              const active = item.id === selected;
              const name =
                drafts[item.id]?.display_name ?? item.display_name;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void selectRepo(item.id)}
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
                    {name || item.name}
                  </span>
                  <span className="w-full truncate text-[10px] text-muted-foreground">
                    {item.path}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-6 p-5">
          {loadError ? (
            <Alert variant="destructive">
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : null}
          {saveSuccess ? (
            <Alert variant="success">
              <AlertDescription>Saved.</AlertDescription>
            </Alert>
          ) : null}
          {saveError ? (
            <Alert variant="destructive">
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <div className="flex items-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading repositories…
            </div>
          ) : !repo || !draft ? (
            <p className="text-sm text-muted-foreground">
              This project has no repositories yet. Add one with +.
            </p>
          ) : (
            <>
              <div className="space-y-4">
                <h2 className="text-base font-semibold">
                  {draft.display_name || repo.name}
                </h2>
                <ConfigField
                  label="Name"
                  hint="A friendly name for this repository in the list and on tasks."
                  htmlFor="repo-name"
                >
                  <Input
                    id="repo-name"
                    value={draft.display_name}
                    onChange={(e) =>
                      patchDraft({ display_name: e.target.value })
                    }
                  />
                </ConfigField>
                <ConfigField
                  label="Path"
                  hint="Where this checkout lives on disk. It is not editable here."
                >
                  <p className="truncate rounded-md bg-muted px-3 py-2 font-mono text-sm text-muted-foreground">
                    {repo.path}
                  </p>
                </ConfigField>
                <ConfigField
                  label="Default working directory"
                  hint="Subdirectory relative to the repository root where the coding agent runs for single-repo workspaces. Leave empty to use the repository root."
                  htmlFor="repo-workdir"
                >
                  <Input
                    id="repo-workdir"
                    value={draft.default_working_dir}
                    placeholder="e.g. packages/frontend"
                    onChange={(e) =>
                      patchDraft({ default_working_dir: e.target.value })
                    }
                  />
                </ConfigField>
                <ConfigField
                  label="Default target branch"
                  hint="The default base branch for new workspaces. Worktrees branch off from this branch and PRs will target it."
                >
                  <BranchSelector
                    branches={branches}
                    selectedBranch={
                      draft.default_target_branch || null
                    }
                    onBranchSelect={(name) =>
                      patchDraft({ default_target_branch: name })
                    }
                    placeholder={
                      branchesLoading
                        ? 'Loading branches…'
                        : 'Select a branch'
                    }
                  />
                </ConfigField>
              </div>

              <div className="space-y-4 border-t pt-6">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold">Scripts</h2>
                  <p className="text-sm text-muted-foreground">
                    These run whenever this repository is used in a workspace.
                  </p>
                </div>
                <ConfigField
                  label="Dev server"
                  hint="Starts a development server. Runs from within the worktree."
                  htmlFor="repo-dev"
                >
                  <AutoExpandingTextarea
                    id="repo-dev"
                    value={draft.dev_server_script}
                    onChange={(e) =>
                      patchDraft({ dev_server_script: e.target.value })
                    }
                    placeholder={placeholders.dev}
                    maxRows={12}
                    className={codeFieldClass}
                  />
                </ConfigField>
                <ConfigField
                  label="Setup"
                  hint="Runs in the worktree after it is created and before the agent starts. Install dependencies here."
                  htmlFor="repo-setup"
                >
                  <AutoExpandingTextarea
                    id="repo-setup"
                    value={draft.setup_script}
                    onChange={(e) =>
                      patchDraft({ setup_script: e.target.value })
                    }
                    placeholder={placeholders.setup}
                    maxRows={12}
                    className={codeFieldClass}
                  />
                </ConfigField>
                <ToggleRow
                  id="repo-parallel-setup"
                  label="Run setup in parallel with the agent"
                  hint="When on, setup runs at the same time as the agent instead of waiting to finish first."
                  checked={draft.parallel_setup_script}
                  disabled={!draft.setup_script.trim()}
                  onChange={(checked) =>
                    patchDraft({ parallel_setup_script: checked })
                  }
                />
                <ConfigField
                  label="Cleanup"
                  hint="Runs in the worktree after the agent, only if it made changes. Linters, tests, formatters."
                  htmlFor="repo-cleanup"
                >
                  <AutoExpandingTextarea
                    id="repo-cleanup"
                    value={draft.cleanup_script}
                    onChange={(e) =>
                      patchDraft({ cleanup_script: e.target.value })
                    }
                    placeholder={placeholders.cleanup}
                    maxRows={12}
                    className={codeFieldClass}
                  />
                </ConfigField>
                <ConfigField
                  label="Copy files"
                  hint="Comma-separated paths or globs copied from the original checkout into the worktree. Keep these gitignored."
                >
                  <MultiFileSearchTextarea
                    value={draft.copy_files}
                    onChange={(value) => patchDraft({ copy_files: value })}
                    placeholder=".env, config/*.json"
                    maxRows={6}
                    repoId={repo.id}
                    className={codeFieldClass}
                  />
                </ConfigField>
              </div>

              <div className="flex items-center gap-2 border-t pt-4">
                <Button
                  onClick={() => void handleSave()}
                  disabled={saving || !dirty}
                >
                  {saving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  disabled={saving}
                  onClick={() => void handleRemove()}
                >
                  Remove repository
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
