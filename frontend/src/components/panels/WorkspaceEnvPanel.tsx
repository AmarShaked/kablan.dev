import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  EyeOff,
  FileKey2,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useDevServer } from '@/hooks/useDevServer';
import { attemptsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { WorkspaceWithSession } from '@/types/attempt';
import type { WorkspaceEnvFile } from 'shared/types';

/**
 * A task's own environment files, editable without leaving the app.
 *
 * A worktree is a separate directory with its own copy of gitignored env files, so it can hold a
 * different value — a staging key, a flag turned on for one experiment — without changing the
 * checkout the worktree came from. Nothing written here touches that repository.
 */

/** Unsaved text, keyed by repository and filename, so switching tabs doesn't discard an edit. */
type Drafts = Record<string, string>;

const draftKey = (repoId: string, name: string) => `${repoId}:${name}`;

/**
 * Blank out anything that looks like a secret.
 *
 * A rough match on the key's name, not the value: these panes get screen-shared, and the point is
 * to cover the obvious cases quickly rather than to be a security boundary — the values are still
 * on disk and still in the response.
 */
function maskSecrets(text: string): string {
  return text.replace(
    /^([^#=\n]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[^=\n]*=)(.+)$/gim,
    (_m, lhs: string) => `${lhs}••••••••`
  );
}

export function WorkspaceEnvPanel({
  attempt,
}: {
  attempt: WorkspaceWithSession;
}) {
  const queryClient = useQueryClient();
  const { repos } = useAttemptRepo(attempt.id);

  const [repoId, setRepoId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [masked, setMasked] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);

  const activeRepo = repos.find((r) => r.id === repoId) ?? repos[0] ?? null;

  // Restarting is stop-then-start, and stop only reports through its callback.
  const wantsRestart = useRef(false);
  const {
    start: startDevServer,
    stop: stopDevServer,
    isStarting,
    isStopping,
    runningDevServers,
  } = useDevServer(attempt.id, {
    onStopSuccess: () => {
      if (!wantsRestart.current) return;
      wantsRestart.current = false;
      startDevServer();
    },
  });
  const devServerRunning = runningDevServers.length > 0;

  const queryKey = ['workspaceEnvFiles', attempt.id, activeRepo?.id];
  const {
    data: files,
    isLoading,
    error,
  } = useQuery<WorkspaceEnvFile[]>({
    queryKey,
    queryFn: () => attemptsApi.listEnvFiles(attempt.id, activeRepo!.id),
    enabled: !!activeRepo,
  });

  const save = useMutation({
    mutationFn: (data: { name: string; content: string }) =>
      attemptsApi.saveEnvFile(attempt.id, activeRepo!.id, data),
    onSuccess: (saved) => {
      queryClient.setQueryData<WorkspaceEnvFile[]>(queryKey, (prev) =>
        (prev ?? []).map((f) => (f.name === saved.name ? saved : f))
      );
      // The draft has become the file, so it is no longer an unsaved change.
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[draftKey(activeRepo!.id, saved.name)];
        return next;
      });
      setSavedName(saved.name);
    },
  });

  // Open a file that exists, so the common case needs no clicks. Derived rather than set by an
  // effect, so switching repository lands on that repository's own first file immediately.
  const selectedName =
    selected ?? files?.find((f) => f.exists)?.name ?? files?.[0]?.name ?? null;
  const file = files?.find((f) => f.name === selectedName) ?? null;

  const key =
    activeRepo && selectedName ? draftKey(activeRepo.id, selectedName) : null;
  const draft = (key ? drafts[key] : undefined) ?? file?.content ?? '';
  const dirty = !!file && draft !== file.content;
  const overridden = !!file && file.content !== file.repo_content;
  // Absent here but present in the repository: the copy step never brought it across, and the
  // useful thing to say is that one exists to take, not that the two "differ".
  const missingHere = !!file && !file.exists && file.repo_content !== '';

  // Files edited but not yet written, so a draft left on another tab can't go unnoticed.
  const unsaved = useMemo(() => {
    if (!activeRepo || !files) return [];
    return files
      .filter((f) => {
        const d = drafts[draftKey(activeRepo.id, f.name)];
        return d !== undefined && d !== f.content;
      })
      .map((f) => f.name);
  }, [activeRepo, files, drafts]);

  // Each repository is checked out into its own directory under the workspace, named after it.
  const worktreePath =
    attempt.container_ref && activeRepo
      ? `${attempt.container_ref}/${activeRepo.name}`
      : null;

  const setDraft = (value: string) => {
    if (!key) return;
    setSavedName(null);
    setDrafts((prev) => ({ ...prev, [key]: value }));
  };

  if (!activeRepo) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          This task has no repository attached.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <FileKey2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-ibm-plex-mono shrink-0 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Environment
        </span>
        {worktreePath && (
          <span
            className="font-ibm-plex-mono min-w-0 flex-1 truncate text-xs text-muted-foreground"
            title={worktreePath}
            // The tail of the path is the part that identifies it, so truncate from the front.
            // The bdi isolates the path so its own left-to-right order holds — without it the
            // bidi algorithm treats the leading "/" as neutral and moves it to the end.
            dir="rtl"
          >
            <bdi>{worktreePath}</bdi>
          </span>
        )}
        <button
          type="button"
          onClick={() => setMasked((m) => !m)}
          title={masked ? 'Show values' : 'Hide secret values'}
          className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {masked ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* One tab per repository, and only when there is more than one to choose. */}
      {repos.length > 1 && (
        <div className="flex shrink-0 border-b border-border bg-muted/30">
          {repos.map((repo) => (
            <button
              key={repo.id}
              onClick={() => {
                setRepoId(repo.id);
                setSelected(null);
              }}
              className={cn(
                'border-b-2 px-3 py-1.5 text-xs transition-colors',
                activeRepo.id === repo.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {repo.name}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading environment files…
        </div>
      )}

      {error && !isLoading && (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <p className="max-w-sm text-sm text-destructive">{String(error)}</p>
        </div>
      )}

      {files && !isLoading && (
        <>
          <div className="flex shrink-0 flex-wrap gap-1 border-b border-border px-3 py-2">
            {files.map((f) => {
              const differs = f.content !== f.repo_content;
              const hasDraft = unsaved.includes(f.name);
              return (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => setSelected(f.name)}
                  title={
                    !f.exists
                      ? f.repo_content
                        ? `${f.name} — not in this worktree; the repository has one`
                        : `${f.name} — not in this worktree yet`
                      : differs
                        ? `${f.name} — differs from the repository copy`
                        : `${f.name} — same as the repository copy`
                  }
                  className={cn(
                    'font-ibm-plex-mono inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
                    selectedName === f.name
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50'
                  )}
                >
                  {f.name}
                  {/* A file that isn't there yet is still offered, so it can be created here. */}
                  {!f.exists && <span className="opacity-50">+</span>}
                  {/* One dot, one meaning: this task's copy is not the repository's. A hollow
                      ring says the same about an edit that hasn't been written yet. */}
                  {(differs || hasDraft) && (
                    <span
                      aria-hidden
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        hasDraft ? 'border border-warning' : 'bg-warning'
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <textarea
            value={masked ? maskSecrets(draft) : draft}
            readOnly={masked}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`KEY=value\n# ${selectedName} is gitignored — it belongs to this worktree alone.`}
            className="font-ibm-plex-mono min-h-0 flex-1 resize-none bg-transparent p-3 text-xs leading-relaxed outline-none"
          />

          {save.error && (
            <p className="shrink-0 border-t border-border px-3 py-2 text-xs text-destructive">
              {String(save.error)}
            </p>
          )}

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-3 py-2">
            <Button
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={!dirty || save.isPending || masked}
              onClick={() =>
                selectedName &&
                save.mutate({ name: selectedName, content: draft })
              }
            >
              {save.isPending ? 'Saving…' : `Save ${selectedName}`}
            </Button>

            {dirty && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs font-normal"
                onClick={() =>
                  setDrafts((prev) => {
                    const next = { ...prev };
                    if (key) delete next[key];
                    return next;
                  })
                }
              >
                Discard
              </Button>
            )}

            {overridden && !dirty && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs font-normal"
                title="Replace this file with the repository's copy"
                onClick={() => setDraft(file!.repo_content)}
              >
                <RotateCcw className="h-3 w-3" />
                {missingHere
                  ? "Copy the repository's"
                  : 'Reset to repository copy'}
              </Button>
            )}

            {/* A dev server already running read these files when it started, so a save it can't
                see is a change that appears not to have worked. */}
            {savedName && devServerRunning && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs font-normal"
                disabled={isStopping || isStarting}
                onClick={() => {
                  wantsRestart.current = true;
                  stopDevServer();
                }}
              >
                {isStopping || isStarting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Restart dev server to pick this up
              </Button>
            )}

            <span className="ml-auto text-xs text-muted-foreground">
              {unsaved.length > 1
                ? `${unsaved.length} files with unsaved changes`
                : dirty
                  ? 'Unsaved changes'
                  : unsaved.length === 1
                    ? `Unsaved changes in ${unsaved[0]}`
                    : savedName
                      ? `Saved ${savedName}.`
                      : missingHere
                        ? 'Not in this worktree; the repository has one'
                        : overridden
                          ? 'Differs from the repository copy'
                          : 'Same as the repository copy'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
