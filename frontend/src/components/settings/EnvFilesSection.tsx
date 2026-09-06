import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/dialogs';
import { Button } from '@/components/ui/button';
import { repoApi } from '@/lib/api';
import type { EnvFile } from 'shared/types';

/**
 * Edit a repository's .env files in place.
 *
 * These files are gitignored, so a fresh worktree never has them — they reach one through the
 * repo's "Copy Files" setting. Editing them here means you don't have to leave the app (or find
 * the checkout on disk) to change a value the dev server needs.
 *
 * The server only accepts a fixed set of filenames, so a name can't be used to reach outside the
 * repository.
 */
export function EnvFilesSection({ repoId }: { repoId: string }) {
  const [files, setFiles] = useState<EnvFile[] | null>(null);
  const [selected, setSelected] = useState<string>('.env');
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setDirty(false);
    setError(null);
    repoApi
      .listEnvFiles(repoId)
      .then((list) => {
        if (cancelled) return;
        setFiles(list);
        // Open whichever file already exists, so the common case needs no clicks.
        const first = list.find((f) => f.exists) ?? list[0];
        setSelected(first.name);
        setContent(first.content);
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  const select = async (name: string) => {
    if (dirty) {
      const result = await ConfirmDialog.show({
        title: 'Discard unsaved changes?',
        message: 'The edits to this file have not been saved.',
        confirmText: 'Discard',
        variant: 'destructive',
      }).catch(() => 'canceled');
      if (result !== 'confirmed') return;
    }
    const file = files?.find((f) => f.name === name);
    setSelected(name);
    setContent(file?.content ?? '');
    setDirty(false);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await repoApi.saveEnvFile(repoId, {
        name: selected,
        content,
      });
      // Keep the local list in step so the "exists" dot updates without a refetch.
      setFiles((prev) =>
        (prev ?? []).map((f) => (f.name === saved.name ? saved : f))
      );
      setDirty(false);
      setSavedAt(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (error && !files) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!files) {
    return (
      <div className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading environment files…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {files.map((f) => (
          <button
            key={f.name}
            type="button"
            onClick={() => select(f.name)}
            className={`font-ibm-plex-mono px-2 py-1 text-xs transition-colors ${
              selected === f.name
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50'
            }`}
          >
            {f.name}
            {/* A file that doesn't exist yet is still offered, so you can create it here. */}
            {!f.exists && <span className="ml-1 opacity-50">+</span>}
          </button>
        ))}
      </div>

      <textarea
        value={content}
        spellCheck={false}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
          setSavedAt(null);
        }}
        rows={12}
        placeholder={`KEY=value\n# ${selected} is gitignored — it never leaves this machine.`}
        className="font-ibm-plex-mono w-full resize-y rounded-md border border-input bg-background p-3 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : `Save ${selected}`}
        </Button>
        {savedAt && !dirty && (
          <span className="text-xs text-muted-foreground">Saved.</span>
        )}
        {dirty && (
          <span className="text-xs text-muted-foreground">
            Unsaved changes.
          </span>
        )}
      </div>
    </div>
  );
}
