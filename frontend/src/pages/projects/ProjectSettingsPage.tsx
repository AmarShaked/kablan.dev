import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { isEqual } from 'lodash';
import { Loader2 } from 'lucide-react';
import type { Project, UpdateProject } from 'shared/types';

import { IconPicker } from '@/components/projects/IconPicker';
import { projectIcon } from '@/components/projects/projectIcons';
import { TagManager } from '@/components/TagManager';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProject } from '@/contexts/ProjectContext';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { ProjectReposPanel } from '@/pages/projects/ProjectReposPanel';

interface ProjectFormState {
  name: string;
  icon: string | null;
}

function projectToFormState(project: Project): ProjectFormState {
  return {
    name: project.name,
    icon: project.icon,
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

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

export function ProjectSettingsPage() {
  const { projectId, project, isLoading } = useProject();

  const [draft, setDraft] = useState<ProjectFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasUnsavedChanges = useMemo(() => {
    if (!draft || !project) return false;
    return !isEqual(draft, projectToFormState(project));
  }, [draft, project]);

  useEffect(() => {
    if (!project || hasUnsavedChanges) return;
    setDraft(projectToFormState(project));
  }, [project, hasUnsavedChanges]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  const { updateProject } = useProjectMutations({
    onUpdateSuccess: (updatedProject: Project) => {
      setDraft(projectToFormState(updatedProject));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      setSaving(false);
    },
    onUpdateError: (err) => {
      setError(
        err instanceof Error ? err.message : 'Failed to save project settings'
      );
      setSaving(false);
    },
  });

  const handleSave = () => {
    if (!draft || !project) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    const updateData: UpdateProject = {
      name: draft.name.trim(),
      icon: draft.icon,
    };
    updateProject.mutate({
      projectId: project.id,
      data: updateData,
    });
  };

  const updateDraft = (updates: Partial<ProjectFormState>) => {
    setDraft((prev) => {
      const base = prev ?? (project ? projectToFormState(project) : null);
      return base ? { ...base, ...updates } : base;
    });
  };

  if (isLoading || !projectId) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        This project could not be found.
      </p>
    );
  }

  const form = draft ?? projectToFormState(project);
  const Icon = projectIcon(form.icon);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert variant="success">
          <AlertDescription>Saved.</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-5 w-5" />
        <h1 className="text-xl font-semibold">{form.name || project.name}</h1>
      </div>

      <Section
        title="General"
        description="How this project is named and recognised around the app."
      >
        <div className="space-y-4">
          <ConfigField
            label="Icon"
            hint="Shown in the sidebar and on every task in this project."
          >
            <IconPicker
              size="sm"
              value={form.icon}
              onChange={(icon) => updateDraft({ icon })}
              className="border-border"
            />
          </ConfigField>
          <ConfigField
            label="Name"
            hint="How this project is labelled in the sidebar, breadcrumb, and task list."
            htmlFor="project-name"
          >
            <Input
              id="project-name"
              type="text"
              value={form.name}
              onChange={(e) => updateDraft({ name: e.target.value })}
              placeholder="Enter project name"
              required
            />
          </ConfigField>
          <div className="flex items-center gap-2 border-t pt-4">
            <Button
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </Section>

      <Section
        title="Tags"
        description="Reusable snippets for this project. Insert one by typing @name, or from the chat menu. Tags with no project are listed here too and are available everywhere."
      >
        <TagManager projectId={project.id} />
      </Section>

      <ProjectReposPanel projectId={project.id} />
    </div>
  );
}
