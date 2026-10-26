import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, FolderGit2, GitBranch, Paperclip, X } from 'lucide-react';
import type {
  AgentRunSelection,
  Repo,
  Task,
  TaskWithAttemptStatus,
} from 'shared/types';

import { projectIcon } from '@/components/projects/projectIcons';
import { AgentRunControls } from '@/components/tasks/AgentRunControls';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUserSystem } from '@/contexts/UserSystemContext';
import {
  useImageUpload,
  useProjectRepos,
  useRepoBranchSelection,
  useTaskMutations,
  type RepoBranchConfig,
} from '@/hooks';
import { useProjects } from '@/hooks/useProjects';
import { defineModal } from '@/lib/modals';
import { repoKeys } from '@/lib/queryKeys';
import { firstRunSelection } from '@/utils/agentRun';
import type { TaskFormDialogProps } from './TaskFormDialog';

const LAST_PROJECT_KEY = 'kablan.lastTaskProject';

type Attachment = {
  id: string;
  name: string;
  path: string;
  url: string;
};

function imageMarkdown(image: Attachment): string {
  return `![${image.name}](${image.path})`;
}

export type NewTaskDialogProps = Exclude<TaskFormDialogProps, { mode: 'edit' }>;

function readLastProject(): string {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberProject(id: string) {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id);
  } catch {
    // Private mode can refuse storage. The choice still applies to this dialog.
  }
}

function imageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const listed = Array.from(data.files).filter((file) =>
    file.type.startsWith('image/')
  );
  if (listed.length > 0) return listed;
  return Array.from(data.items).flatMap((item) => {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
}

function initialCopy(props: NewTaskDialogProps): {
  title: string;
  description: string;
} {
  if (props.mode === 'duplicate') {
    return {
      title: props.initialTask.title,
      description: props.initialTask.description ?? '',
    };
  }
  if (props.mode === 'create') {
    return {
      title: props.initialTitle ?? '',
      description: props.initialDescription ?? '',
    };
  }
  return { title: '', description: '' };
}

const chipClass =
  'inline-flex h-7 max-w-[12rem] items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 text-xs text-foreground hover:bg-accent disabled:opacity-50';

const ChipButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: ReactNode;
    label: string;
  }
>(function ChipButton({ icon, label, ...props }, ref) {
  return (
    <button type="button" ref={ref} className={chipClass} {...props}>
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
});

const NewTaskDialogImpl = NiceModal.create<NewTaskDialogProps>((props) => {
  const modal = useModal();
  const queryClient = useQueryClient();
  const { system } = useUserSystem();
  const { projects } = useProjects();
  const { upload } = useImageUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const copy = initialCopy(props);
  const [title, setTitle] = useState(copy.title);
  const [description, setDescription] = useState(copy.description);
  const [projectId, setProjectId] = useState(() =>
    props.mode === 'create'
      ? (props.projectId ?? readLastProject())
      : props.projectId
  );
  const [selection, setSelection] = useState<AgentRunSelection>(
    () => system.config?.last_agent_selection ?? firstRunSelection()
  );
  const [images, setImages] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const agentTouched = useRef(false);

  const preventNavigate = props.mode === 'create' && !!props.preventNavigate;
  const { createAndStart } = useTaskMutations(projectId, {
    navigateOnSuccess: preventNavigate ? false : undefined,
  });
  const { data: projectRepos = [] } = useProjectRepos(projectId || undefined);
  const initialBranch =
    props.mode === 'subtask' ? props.initialBaseBranch : undefined;
  const { configs, setRepoBranch } = useRepoBranchSelection({
    repos: projectRepos,
    initialBranch,
    enabled: !!projectId && projectRepos.length > 0,
  });

  const savedSelection = system.config?.last_agent_selection;
  useEffect(() => {
    if (agentTouched.current || !savedSelection) return;
    setSelection((current) =>
      current.executor === savedSelection.executor &&
      current.model === savedSelection.model &&
      current.permission === savedSelection.permission
        ? current
        : savedSelection
    );
  }, [savedSelection]);

  useEffect(() => {
    if (!projectId || projects.length === 0) return;
    if (!projects.some((project) => project.id === projectId)) {
      setProjectId('');
    }
  }, [projectId, projects]);

  const project = projects.find((item) => item.id === projectId);
  const ProjectIcon = projectIcon(project?.icon);
  const branchesReady =
    configs.length > 0 && configs.every((config) => config.targetBranch);
  const dirty =
    title.trim().length > 0 ||
    description.trim().length > 0 ||
    images.length > 0;

  const close = () => {
    modal.remove();
  };

  const requestClose = () => {
    if (dirty) setDiscarding(true);
    else close();
  };

  const chooseProject = (id: string) => {
    setProjectId(id);
    rememberProject(id);
  };

  const chooseBranch = async (repoId: string, branch: string) => {
    setRepoBranch(repoId, branch);
    if (!projectId) return;
    try {
      const { repoApi } = await import('@/lib/api');
      const updated = await repoApi.update(repoId, {
        default_target_branch: branch,
      });
      queryClient.setQueryData<Repo[] | undefined>(
        repoKeys.byProject(projectId),
        (old) => old?.map((repo) => (repo.id === updated.id ? updated : repo))
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save the default branch'
      );
    }
  };

  const onAttach = async (files: File[]) => {
    if (files.length === 0 || submitting) return;
    for (const file of files) {
      const pendingId = `pending-${crypto.randomUUID()}`;
      let preview = '';
      try {
        preview = URL.createObjectURL(file);
        setImages((prev) => [
          ...prev,
          { id: pendingId, name: file.name, path: '', url: preview },
        ]);
        const img = await upload(file);
        URL.revokeObjectURL(preview);
        setImages((prev) =>
          prev.map((item) =>
            item.id === pendingId
              ? {
                  id: img.id,
                  name: img.original_name,
                  path: img.file_path,
                  url: `/api/images/${img.id}/file`,
                }
              : item
          )
        );
      } catch (err) {
        if (preview) URL.revokeObjectURL(preview);
        setImages((prev) => prev.filter((item) => item.id !== pendingId));
        setError(err instanceof Error ? err.message : 'Could not attach image');
      }
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const image = prev.find((item) => item.id === id);
      if (image?.url.startsWith('blob:')) URL.revokeObjectURL(image.url);
      return prev.filter((item) => item.id !== id);
    });
  };

  const start = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed || !projectId || !branchesReady || submitting) return;
    setSubmitting(true);
    setError(null);
    const source = props.mode === 'create' ? props.source : undefined;
    const readyImages = images.filter((image) => image.path);
    const extra = readyImages
      .map(imageMarkdown)
      .filter((line) => !description.includes(line));
    const body = description.trim();
    const descriptionWithImages =
      extra.length === 0
        ? body || null
        : body
          ? `${body}\n${extra.join('\n')}`
          : extra.join('\n');
    const task = {
      project_id: projectId,
      title: trimmed,
      description: descriptionWithImages,
      status: null,
      parent_workspace_id:
        props.mode === 'subtask' ? props.parentTaskAttemptId : null,
      image_ids:
        readyImages.length > 0 ? readyImages.map((image) => image.id) : null,
      source_provider: source?.provider ?? null,
      source_id: source?.id ?? null,
      source_identifier: source?.identifier ?? null,
      source_url: source?.url ?? null,
    };
    try {
      const created = await createAndStart.mutateAsync({
        task,
        agent_selection: selection,
        repos: configs
          .filter((config) => config.targetBranch)
          .map((config) => ({
            repo_id: config.repoId,
            target_branch: config.targetBranch!,
          })),
      });
      rememberProject(projectId);
      if (props.mode === 'create') {
        props.onCreateSuccess?.(created as Task | TaskWithAttemptStatus);
      }
      modal.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the task');
      setSubmitting(false);
    }
  }, [
    branchesReady,
    configs,
    createAndStart,
    description,
    images,
    modal,
    projectId,
    props,
    selection,
    submitting,
    title,
  ]);

  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => !open && requestClose()}
    >
      <DialogContent
        aria-describedby={undefined}
        className="max-w-xl gap-0 p-0 sm:rounded-xl"
      >
        <DialogTitle className="sr-only">New task</DialogTitle>
        <div
          className="flex flex-col gap-3 p-4"
          onPaste={(event) => {
            const files = imageFiles(event.clipboardData);
            if (files.length === 0) return;
            event.preventDefault();
            void onAttach(files);
          }}
        >
          <div className="flex flex-wrap items-center gap-1.5 pr-8">
            <ProjectChip
              name={project?.name}
              icon={<ProjectIcon className="h-3.5 w-3.5" />}
              projects={projects}
              onSelect={chooseProject}
            />
            <span className="text-xs text-muted-foreground" aria-hidden>
              ›
            </span>
            {configs.length === 0 ? (
              <ChipButton
                icon={<GitBranch className="h-3.5 w-3.5" />}
                label="Branch"
                disabled
              />
            ) : (
              configs.map((config) => (
                <BranchChip
                  key={config.repoId}
                  config={config}
                  showRepo={configs.length > 1}
                  disabled={submitting}
                  onSelect={(branch) =>
                    void chooseBranch(config.repoId, branch)
                  }
                />
              ))
            )}
          </div>

          <input
            aria-label="Task title"
            placeholder="Task title"
            value={title}
            autoFocus
            disabled={submitting}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void start();
              }
            }}
            className="w-full bg-transparent text-lg font-medium outline-none placeholder:text-muted-foreground"
          />
          <textarea
            aria-label="description"
            placeholder="Add description…"
            value={description}
            rows={4}
            disabled={submitting}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void start();
              }
            }}
            className="min-h-24 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((image) => (
                <span key={image.id} className="group relative">
                  <img
                    src={image.url}
                    alt={image.name}
                    className="h-16 w-16 rounded-md border border-border object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${image.name}`}
                    disabled={submitting}
                    onClick={() => removeImage(image.id)}
                    className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <AgentRunControls
            variant="chips"
            selection={selection}
            disabled={submitting}
            onChange={(next) => {
              agentTouched.current = true;
              setSelection(next);
            }}
          />

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center justify-between gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void onAttach(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Attach image"
              disabled={submitting}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <Button
              type="button"
              disabled={
                !title.trim() || !projectId || !branchesReady || submitting
              }
              onClick={() => void start()}
            >
              {submitting ? 'Starting' : 'Start'}
            </Button>
          </div>
        </div>

        {discarding && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/95 p-6">
            <div className="w-full max-w-sm space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Discard this task?</h2>
                <p className="pt-2 text-sm text-muted-foreground">
                  The title and description will be lost.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDiscarding(false)}>
                  Keep editing
                </Button>
                <Button variant="destructive" onClick={close}>
                  Discard
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});

function ProjectChip({
  name,
  icon,
  projects,
  onSelect,
}: {
  name?: string;
  icon: ReactNode;
  projects: { id: string; name: string; icon: string | null }[];
  onSelect: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ChipButton
          icon={name ? icon : <FolderGit2 className="h-3.5 w-3.5" />}
          label={name ?? 'Project'}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 w-56 overflow-y-auto"
      >
        {projects.map((project) => {
          const Icon = projectIcon(project.icon);
          const selected = project.name === name;
          return (
            <DropdownMenuItem
              key={project.id}
              onClick={() => onSelect(project.id)}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              {selected && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BranchChip({
  config,
  showRepo,
  disabled,
  onSelect,
}: {
  config: RepoBranchConfig;
  showRepo: boolean;
  disabled: boolean;
  onSelect: (branch: string) => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const branches = needle
    ? config.branches.filter((branch) =>
        branch.name.toLowerCase().includes(needle)
      )
    : config.branches;
  const label = config.targetBranch
    ? showRepo
      ? `${config.repoDisplayName} · ${config.targetBranch}`
      : config.targetBranch
    : 'Branch';
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setQuery('');
      }}
    >
      <DropdownMenuTrigger asChild>
        <ChipButton
          icon={<GitBranch className="h-3.5 w-3.5" />}
          label={label}
          disabled={disabled}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <div
          className="border-b p-1.5"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search branches"
            aria-label="Search branches"
            className="h-7 w-full bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {branches.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              No matching branch
            </p>
          ) : (
            branches.map((branch) => (
              <DropdownMenuItem
                key={branch.name}
                onClick={() => onSelect(branch.name)}
              >
                <GitBranch className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                {branch.name === config.targetBranch && (
                  <Check className="h-3.5 w-3.5" />
                )}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const NewTaskDialog = defineModal<NewTaskDialogProps, void>(
  NewTaskDialogImpl
);
