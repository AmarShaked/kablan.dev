import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { useDropzone } from 'react-dropzone';
import { useForm, useStore } from '@tanstack/react-form';
import { Image as ImageIcon } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import type { LocalImageMetadata } from '@/components/ui/wysiwyg/context/task-attempt-context';
import BranchSelector from '@/components/tasks/BranchSelector';
import RepoBranchSelector from '@/components/tasks/RepoBranchSelector';
import { ExecutorProfileSelector } from '@/components/settings';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { useProjects } from '@/hooks/useProjects';
import {
  useTaskImages,
  useImageUpload,
  useTaskMutations,
  useProjectRepos,
  useRepoBranchSelection,
} from '@/hooks';
import {
  useKeySubmitTask,
  useKeySubmitTaskAlt,
  useKeyExit,
  Scope,
} from '@/keyboard';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { cn } from '@/lib/utils';
import type {
  TaskStatus,
  ExecutorProfileId,
  ImageResponse,
} from 'shared/types';

interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export type TaskFormDialogProps =
  /** `projectId` is optional here alone: opened from the sidebar there is no project yet, and
   *  the form asks for one. Everywhere else the project is where you already are. */
  | { mode: 'create'; projectId?: string }
  | { mode: 'edit'; projectId: string; task: Task }
  | { mode: 'duplicate'; projectId: string; initialTask: Task }
  | {
      mode: 'subtask';
      projectId: string;
      parentTaskAttemptId: string;
      initialBaseBranch: string;
    };

type RepoBranch = { repoId: string; branch: string };

type TaskFormValues = {
  title: string;
  description: string;
  status: TaskStatus;
  executorProfileId: ExecutorProfileId | null;
  repoBranches: RepoBranch[];
  autoStart: boolean;
};

const TaskFormDialogImpl = NiceModal.create<TaskFormDialogProps>((props) => {
  const { mode } = props;
  // A create opened without a project picks one here; every other mode is bound to the project
  // it was opened from, so the state simply never changes.
  const [projectId, setProjectId] = useState(props.projectId ?? '');
  const choosingProject = mode === 'create' && !props.projectId;
  const editMode = mode === 'edit';
  const modal = useModal();
  const { t } = useTranslation(['tasks', 'common']);
  const { createTask, createAndStart, updateTask } =
    useTaskMutations(projectId);
  const { system, profiles, loading: userSystemLoading } = useUserSystem();
  const { projects } = useProjects();
  const { upload, uploadForTask } = useImageUpload();
  const { enableScope, disableScope } = useHotkeysContext();

  // Local UI state
  const [images, setImages] = useState<ImageResponse[]>([]);
  const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<string[]>(
    []
  );
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);
  const forceCreateOnlyRef = useRef(false);

  const { data: taskImages } = useTaskImages(
    editMode ? props.task.id : undefined
  );
  const { data: projectRepos = [] } = useProjectRepos(projectId, {
    enabled: modal.visible,
  });
  const initialBranch =
    mode === 'subtask' ? props.initialBaseBranch : undefined;
  const { configs: repoBranchConfigs, isLoading: branchesLoading } =
    useRepoBranchSelection({
      repos: projectRepos,
      initialBranch,
      enabled: modal.visible && projectRepos.length > 0,
    });

  const defaultRepoBranches = useMemo((): RepoBranch[] => {
    return repoBranchConfigs
      .filter((c) => c.targetBranch !== null)
      .map((c) => ({ repoId: c.repoId, branch: c.targetBranch! }));
  }, [repoBranchConfigs]);

  // Get default form values based on mode
  const defaultValues = useMemo((): TaskFormValues => {
    const baseProfile = system.config?.executor_profile || null;

    switch (mode) {
      case 'edit':
        return {
          title: props.task.title,
          description: props.task.description || '',
          status: props.task.status,
          executorProfileId: baseProfile,
          repoBranches: defaultRepoBranches,
          autoStart: false,
        };

      case 'duplicate':
        return {
          title: props.initialTask.title,
          description: props.initialTask.description || '',
          status: 'todo',
          executorProfileId: baseProfile,
          repoBranches: defaultRepoBranches,
          autoStart: true,
        };

      case 'subtask':
      case 'create':
      default:
        return {
          title: '',
          description: '',
          status: 'todo',
          executorProfileId: baseProfile,
          repoBranches: defaultRepoBranches,
          autoStart: true,
        };
    }
  }, [mode, props, system.config?.executor_profile, defaultRepoBranches]);

  // Form submission handler
  const handleSubmit = async ({ value }: { value: TaskFormValues }) => {
    if (editMode) {
      await updateTask.mutateAsync(
        {
          taskId: props.task.id,
          data: {
            title: value.title,
            description: value.description,
            status: value.status,
            parent_workspace_id: null,
            image_ids: images.length > 0 ? images.map((img) => img.id) : null,
          },
        },
        { onSuccess: () => modal.remove() }
      );
    } else {
      const imageIds =
        newlyUploadedImageIds.length > 0 ? newlyUploadedImageIds : null;
      const task = {
        project_id: projectId,
        title: value.title,
        description: value.description,
        status: null,
        parent_workspace_id:
          mode === 'subtask' ? props.parentTaskAttemptId : null,
        image_ids: imageIds,
        shared_task_id: null,
      };
      const shouldAutoStart = value.autoStart && !forceCreateOnlyRef.current;
      if (shouldAutoStart) {
        const repos = value.repoBranches.map((rb) => ({
          repo_id: rb.repoId,
          target_branch: rb.branch,
        }));
        await createAndStart.mutateAsync(
          {
            task,
            executor_profile_id: value.executorProfileId!,
            repos,
          },
          { onSuccess: () => modal.remove() }
        );
      } else {
        await createTask.mutateAsync(task, { onSuccess: () => modal.remove() });
      }
    }
  };

  const validator = (value: TaskFormValues): string | undefined => {
    if (!value.title.trim().length) return 'need title';
    if (value.autoStart && !forceCreateOnlyRef.current) {
      if (!value.executorProfileId) return 'need executor profile';
      if (
        value.repoBranches.length === 0 ||
        value.repoBranches.some((rb) => !rb.branch)
      ) {
        return 'need branch for all repos';
      }
    }
  };

  // Initialize TanStack Form
  const form = useForm({
    defaultValues: defaultValues,
    onSubmit: handleSubmit,
    validators: {
      // we use an onMount validator so that the primary action button can
      // enable/disable itself based on `canSubmit`
      onMount: ({ value }) => validator(value),
      onChange: ({ value }) => validator(value),
    },
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const isDirty = useStore(form.store, (state) => state.isDirty);
  const canSubmit = useStore(form.store, (state) => state.canSubmit);

  // Branches arrive late — from the sidebar, not until a project has been picked, which is
  // usually after the first keystroke. TanStack Form re-applies `defaultValues` only while the
  // form is untouched, so by then the seeded branches never land: the form fails its own
  // "need branch for all repos" rule and Create stays disabled with a branch on screen and no
  // hint of what is missing. Put them into the field ourselves instead, keeping whatever branch
  // the user has already picked for a repo that is still in play.
  //
  // `dontUpdateMeta`/`dontValidate` keep this a seed rather than an edit: it must not mark the
  // form dirty (that would raise "discard unsaved changes?" over a form nobody typed in) or
  // touched (that is what tells the onMount validator the user has started). The explicit
  // `validate` is what refreshes `canSubmit` afterwards.
  const seededBranches = useRef<string | null>(null);
  useEffect(() => {
    const key = defaultRepoBranches
      .map((b) => `${b.repoId}@${b.branch}`)
      .join();
    if (key === seededBranches.current) return;
    seededBranches.current = key;
    form.setFieldValue(
      'repoBranches',
      (current) =>
        defaultRepoBranches.map((fallback) => {
          const chosen = current.find((c) => c.repoId === fallback.repoId);
          return chosen?.branch ? chosen : fallback;
        }),
      { dontUpdateMeta: true, dontValidate: true }
    );
    form.validate('change');
  }, [defaultRepoBranches, form]);

  // Load images for edit mode
  useEffect(() => {
    if (!taskImages) return;
    setImages(taskImages);
  }, [taskImages]);

  const onDrop = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        try {
          // In edit mode, use uploadForTask to associate immediately
          // In create mode, use plain upload (will associate on task creation)
          const img = editMode
            ? await uploadForTask(props.task.id, file)
            : await upload(file);

          // Add markdown image reference to description
          const markdownText = `![${img.original_name}](${img.file_path})`;
          form.setFieldValue('description', (prev) =>
            prev.trim() === '' ? markdownText : `${prev} ${markdownText}`
          );
          setImages((prev) => [...prev, img]);
          setNewlyUploadedImageIds((prev) => [...prev, img.id]);
        } catch {
          // Silently ignore upload errors for now
        }
      }
    },
    [editMode, props, upload, uploadForTask, form]
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: dropzoneOpen,
  } = useDropzone({
    onDrop: onDrop,
    accept: { 'image/*': [] },
    disabled: isSubmitting,
    noClick: true,
    noKeyboard: true,
  });

  // Compute localImages for WYSIWYG rendering of uploaded images
  const localImages: LocalImageMetadata[] = useMemo(
    () =>
      images.map((img) => ({
        path: img.file_path,
        proxy_url: `/api/images/${img.id}/file`,
        file_name: img.original_name,
        size_bytes: Number(img.size_bytes),
        format: img.mime_type?.split('/')[1] ?? 'png',
      })),
    [images]
  );

  // Unsaved changes detection
  const hasUnsavedChanges = useCallback(() => {
    if (isDirty) return true;
    if (newlyUploadedImageIds.length > 0) return true;
    if (images.length > 0 && !editMode) return true;
    return false;
  }, [isDirty, newlyUploadedImageIds, images, editMode]);

  // beforeunload listener
  useEffect(() => {
    if (!modal.visible || isSubmitting) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [modal.visible, isSubmitting, hasUnsavedChanges]);

  // Keyboard shortcuts
  const primaryAction = useCallback(() => {
    if (isSubmitting || !canSubmit || !projectId) return;
    void form.handleSubmit();
  }, [form, isSubmitting, canSubmit, projectId]);

  const shortcutsEnabled =
    modal.visible &&
    !isSubmitting &&
    canSubmit &&
    !!projectId &&
    !showDiscardWarning;

  useKeySubmitTask(primaryAction, {
    enabled: shortcutsEnabled,
    scope: Scope.DIALOG,
    enableOnFormTags: ['input', 'INPUT', 'textarea', 'TEXTAREA'],
    preventDefault: true,
  });

  const canSubmitAlt = useStore(
    form.store,
    (state) => state.values.title.trim().length > 0 && !state.isSubmitting
  );

  const handleSubmitCreateOnly = useCallback(() => {
    forceCreateOnlyRef.current = true;
    const promise = form.handleSubmit();
    Promise.resolve(promise).finally(() => {
      forceCreateOnlyRef.current = false;
    });
  }, [form]);

  useKeySubmitTaskAlt(handleSubmitCreateOnly, {
    enabled: modal.visible && canSubmitAlt && !showDiscardWarning,
    scope: Scope.DIALOG,
    enableOnFormTags: ['input', 'INPUT', 'textarea', 'TEXTAREA'],
    preventDefault: true,
  });

  // Dialog close handling
  const handleDialogClose = (open: boolean) => {
    if (open) return;
    if (hasUnsavedChanges()) {
      setShowDiscardWarning(true);
    } else {
      modal.remove();
    }
  };

  const handleDiscardChanges = () => {
    form.reset();
    setImages([]);
    setNewlyUploadedImageIds([]);
    setShowDiscardWarning(false);
    modal.remove();
  };

  const handleContinueEditing = () => {
    setShowDiscardWarning(false);
  };

  // Manage CONFIRMATION scope when warning is shown
  useEffect(() => {
    if (showDiscardWarning) {
      disableScope(Scope.DIALOG);
      enableScope(Scope.CONFIRMATION);
    } else {
      disableScope(Scope.CONFIRMATION);
      enableScope(Scope.DIALOG);
    }
  }, [showDiscardWarning, enableScope, disableScope]);

  useKeyExit(handleContinueEditing, {
    scope: Scope.CONFIRMATION,
    when: () => modal.visible && showDiscardWarning,
  });

  // Only the executor profile has to be known before the form is worth showing. Branches are not
  // waited for here: picking a project starts fetching them, and returning nothing would rip an
  // open Radix dialog out of the DOM mid-life. Radix leaves `pointer-events: none` on <body> when
  // that happens, so after the dialog is closed the whole app stops responding to clicks — the
  // "New task" button included. The branch picker says it is loading on its own.
  if (userSystemLoading) return <></>;

  return (
    <>
      <Dialog
        open={modal.visible}
        onOpenChange={handleDialogClose}
        uncloseable={showDiscardWarning}
      >
        {/* The form is the dialog's content, not a child of its root: Radix renders anything
            else in place, which puts the whole form inline in the page. */}
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto overflow-x-hidden p-0">
          {/* The positioning context for the discard warning below — on DialogContent itself a
              `relative` would collide with the `fixed` that centres it.

              min-w-0 because this is a grid item, and a grid item's default `min-width: auto`
              refuses to shrink below its content: one long branch name in the row below and the
              whole form grew past the dialog, clipping the Create button. */}
          <div className="relative min-w-0">
            <div
              {...getRootProps()}
              className="h-full flex flex-col gap-4 p-4 min-h-0"
            >
              <input {...getInputProps()} />
              {/* Drag overlay */}
              {isDragActive && (
                <div className="absolute inset-0 z-50 bg-primary/95 border-2 border-dashed border-primary-foreground/50 rounded-lg flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 text-primary-foreground" />
                    <p className="text-lg font-medium text-primary-foreground">
                      {t('taskFormDialog.dropImagesHere')}
                    </p>
                  </div>
                </div>
              )}

              {choosingProject && (
                <div className="space-y-1.5">
                  <Label htmlFor="task-project" className="text-sm font-medium">
                    Project
                  </Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger id="task-project">
                      <SelectValue placeholder="Choose a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Title */}
              <form.Field name="title">
                {(field) => (
                  <Input
                    id="task-title"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder={t('taskFormDialog.titlePlaceholder')}
                    disabled={isSubmitting}
                    className="text-base"
                    autoFocus
                  />
                )}
              </form.Field>

              {/* Description */}
              <form.Field name="description">
                {(field) => (
                  <div className="border p-3">
                    <WYSIWYGEditor
                      placeholder={t('taskFormDialog.descriptionPlaceholder')}
                      className="w-full h-24 overflow-auto"
                      value={field.state.value}
                      onChange={(desc) => field.handleChange(desc)}
                      disabled={isSubmitting}
                      projectId={projectId}
                      onPasteFiles={onDrop}
                      onCmdEnter={primaryAction}
                      onShiftCmdEnter={handleSubmitCreateOnly}
                      taskId={editMode ? props.task.id : undefined}
                      localImages={localImages}
                    />
                  </div>
                )}
              </form.Field>
              {/* Edit mode status */}
              {editMode && (
                <form.Field name="status">
                  {(field) => (
                    <div className="space-y-2">
                      <Label
                        htmlFor="task-status"
                        className="text-sm font-medium"
                      >
                        {t('taskFormDialog.statusLabel')}
                      </Label>
                      <Select
                        value={field.state.value}
                        onValueChange={(value) =>
                          field.handleChange(value as TaskStatus)
                        }
                        disabled={isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">
                            {t('taskFormDialog.statusOptions.todo')}
                          </SelectItem>
                          <SelectItem value="inprogress">
                            {t('taskFormDialog.statusOptions.inprogress')}
                          </SelectItem>
                          <SelectItem value="inreview">
                            {t('taskFormDialog.statusOptions.inreview')}
                          </SelectItem>
                          <SelectItem value="done">
                            {t('taskFormDialog.statusOptions.done')}
                          </SelectItem>
                          <SelectItem value="cancelled">
                            {t('taskFormDialog.statusOptions.cancelled')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </form.Field>
              )}

              {/* Create mode dropdowns */}
              {!editMode && (
                <form.Field name="autoStart" mode="array">
                  {(autoStartField) => {
                    const isSingleRepo = repoBranchConfigs.length === 1;
                    return (
                      <div
                        className={cn(
                          'transition-opacity duration-200',
                          isSingleRepo ? '' : 'space-y-3',
                          autoStartField.state.value
                            ? 'opacity-100'
                            : 'opacity-0 pointer-events-none'
                        )}
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <form.Field name="executorProfileId">
                            {(field) => (
                              <ExecutorProfileSelector
                                profiles={profiles}
                                selectedProfile={field.state.value}
                                onProfileSelect={(profile) =>
                                  field.handleChange(profile)
                                }
                                disabled={
                                  isSubmitting || !autoStartField.state.value
                                }
                                showLabel={false}
                                className="flex items-center gap-2 flex-row flex-[2] min-w-0"
                                itemClassName="flex-1 min-w-0"
                              />
                            )}
                          </form.Field>
                          {isSingleRepo && (
                            <form.Field name="repoBranches">
                              {(field) => {
                                const config = repoBranchConfigs[0];
                                const selectedBranch =
                                  field.state.value.find(
                                    (v) => v.repoId === config.repoId
                                  )?.branch ?? config.targetBranch;
                                return (
                                  <div
                                    className={cn(
                                      'flex-1 min-w-0',
                                      isSubmitting &&
                                        'opacity-50 pointer-events-none'
                                    )}
                                  >
                                    <BranchSelector
                                      branches={config.branches}
                                      selectedBranch={selectedBranch}
                                      onBranchSelect={(branch) => {
                                        field.handleChange([
                                          { repoId: config.repoId, branch },
                                        ]);
                                      }}
                                      placeholder={
                                        branchesLoading
                                          ? t('taskForm.loadingBranches')
                                          : t('taskForm.selectBranch')
                                      }
                                    />
                                  </div>
                                );
                              }}
                            </form.Field>
                          )}
                        </div>
                        {!isSingleRepo && (
                          <form.Field name="repoBranches">
                            {(field) => {
                              const configs = repoBranchConfigs.map(
                                (config) => ({
                                  ...config,
                                  targetBranch:
                                    field.state.value.find(
                                      (v) => v.repoId === config.repoId
                                    )?.branch ?? config.targetBranch,
                                })
                              );
                              return (
                                <RepoBranchSelector
                                  configs={configs}
                                  onBranchChange={(repoId, branch) => {
                                    const newValue = field.state.value.map(
                                      (v) =>
                                        v.repoId === repoId
                                          ? { ...v, branch }
                                          : v
                                    );
                                    if (
                                      !newValue.find((v) => v.repoId === repoId)
                                    ) {
                                      newValue.push({ repoId, branch });
                                    }
                                    field.handleChange(newValue);
                                  }}
                                  isLoading={branchesLoading}
                                  showLabel={true}
                                  className={cn(
                                    isSubmitting &&
                                      'opacity-50 pointer-events-none'
                                  )}
                                />
                              );
                            }}
                          </form.Field>
                        )}
                      </div>
                    );
                  }}
                </form.Field>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between gap-3">
                {/* Attach Image*/}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={dropzoneOpen}
                    className="h-9 w-9 p-0 rounded-none"
                    aria-label={t('taskFormDialog.attachImage')}
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                </div>

                {/* Autostart switch */}
                <div className="flex items-center gap-3">
                  {!editMode && (
                    <form.Field name="autoStart">
                      {(field) => (
                        <div className="flex items-center gap-2">
                          <Switch
                            id="autostart-switch"
                            checked={field.state.value}
                            onCheckedChange={(checked) =>
                              field.handleChange(checked)
                            }
                            disabled={isSubmitting}
                            className="data-[state=checked]:bg-gray-900 dark:data-[state=checked]:bg-gray-100"
                            aria-label={t('taskFormDialog.startLabel')}
                          />
                          <Label
                            htmlFor="autostart-switch"
                            className="text-sm cursor-pointer"
                          >
                            {t('taskFormDialog.startLabel')}
                          </Label>
                        </div>
                      )}
                    </form.Field>
                  )}

                  {/* Create/Start/Update button*/}
                  <form.Subscribe
                    selector={(state) => ({
                      canSubmit: state.canSubmit,
                      isSubmitting: state.isSubmitting,
                      values: state.values,
                    })}
                  >
                    {({ canSubmit, isSubmitting, values }) => {
                      const buttonText = editMode
                        ? isSubmitting
                          ? t('taskFormDialog.updating')
                          : t('taskFormDialog.updateTask')
                        : isSubmitting
                          ? values.autoStart
                            ? t('taskFormDialog.starting')
                            : t('taskFormDialog.creating')
                          : t('taskFormDialog.create');

                      return (
                        <Button
                          onClick={form.handleSubmit}
                          // A task has to land somewhere: without a project there is nothing
                          // to create it in.
                          disabled={!canSubmit || !projectId}
                        >
                          {buttonText}
                        </Button>
                      );
                    }}
                  </form.Subscribe>
                </div>
              </div>
            </div>

            {/* Inside the dialog, over the form it is asking about.
              It was a second Dialog for a while, and two stacked Radix dialogs raced: closing
              this one and reopening it before its exit animation finished left it mounted but
              invisible, so the close button appeared to do nothing. One dialog cannot race with
              itself, and the form stays mounted underneath, so "Continue editing" returns to a
              form that still has everything that was typed. */}
            {showDiscardWarning && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/95 p-6">
                <div className="w-full max-w-sm space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {t('taskFormDialog.discardDialog.title')}
                    </h2>
                    <p className="pt-2 text-sm text-muted-foreground">
                      {t('taskFormDialog.discardDialog.description')}
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={handleContinueEditing}>
                      {t('taskFormDialog.discardDialog.continueEditing')}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDiscardChanges}
                    >
                      {t('taskFormDialog.discardDialog.discardChanges')}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

export const TaskFormDialog = defineModal<TaskFormDialogProps, void>(
  TaskFormDialogImpl
);
