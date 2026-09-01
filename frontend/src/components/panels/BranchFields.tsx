import { useEffect, useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import { Check, GitBranch as GitBranchIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useGitOperations } from '@/hooks/useGitOperations';
import { useRenameBranch } from '@/hooks/useRenameBranch';
import { useRepoBranches } from '@/hooks';
import { cn } from '@/lib/utils';

/**
 * The two branch fields of the properties pane, edited where they are shown.
 *
 * Both of these used to be dialogs behind a pencil and a gear: three clicks and a modal over the
 * whole window to change a string that is already on screen. A property list is the one place
 * where editing in place is obviously right — the value you are looking at becomes the value you
 * are typing into, and nothing moves.
 */

/** Shared with the panel so an edited value sits exactly where the read-only one did. */
const FIELD = 'w-full bg-transparent text-[11px] outline-none';

/**
 * The resting state of an editable value.
 *
 * Without it these two read as plain text — the pencil and the gear used to be the sign that
 * something could be changed here, and removing them left nothing in their place. The tint on
 * hover is the same one the other clickable properties use, so the pane answers "what can I
 * click" consistently. It bleeds past the text box by the row's own padding so the highlight
 * lines up with the rows above and below.
 */
const HOVERABLE =
  // min-h-6 matches the value box the other properties fill, so the highlight is the same
  // height down the whole column rather than hugging this one line of text.
  '-mx-1 flex min-h-6 items-center rounded px-1 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none';

/**
 * The attempt's own branch, renamed in place.
 *
 * A rename is confirmed rather than assumed: Enter or the check applies it, and Escape or a click
 * anywhere else puts back what was there. Renaming a branch is a real git operation on a worktree
 * an agent may be working in, so it should never happen because a field lost focus.
 */
export function BranchNameField({
  attemptId,
  branch,
  disabled,
}: {
  attemptId: string;
  branch: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(branch);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLSpanElement>(null);

  const rename = useRenameBranch(
    attemptId,
    () => {
      setEditing(false);
      setError(null);
    },
    () => setError('Could not rename')
  );

  // A rename from anywhere else — or a rejected one rolling back — should show here.
  useEffect(() => {
    if (!editing) setDraft(branch);
  }, [branch, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // Clicking anywhere else puts the field away and leaves the branch alone — the edit was never
  // approved, and an editor left open over a property list is a trap for the next click.
  useEffect(() => {
    if (!editing) return;
    const onPointerDown = (e: PointerEvent) => {
      if (editorRef.current?.contains(e.target as Node)) return;
      setDraft(branch);
      setError(null);
      setEditing(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [editing, branch]);

  const trimmed = draft.trim();
  const unchanged = trimmed === branch;
  const invalid = !trimmed || trimmed.includes(' ');

  const commit = () => {
    if (unchanged || !trimmed) {
      setDraft(branch);
      setEditing(false);
      setError(null);
      return;
    }
    if (trimmed.includes(' ')) {
      setError('No spaces');
      return;
    }
    rename.mutate(trimmed);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => !disabled && setEditing(true)}
        disabled={disabled}
        title={error ?? 'Click to rename'}
        className={cn(
          HOVERABLE,
          'w-full min-w-0 gap-1.5 text-left disabled:pointer-events-none disabled:hover:bg-transparent'
        )}
      >
        <span className="min-w-0 truncate">{branch}</span>
        {error && <span className="shrink-0 text-destructive">{error}</span>}
      </button>
    );
  }

  return (
    <span
      ref={editorRef}
      className="-mx-1 flex min-h-6 w-full min-w-0 items-center gap-1 px-1"
    >
      {/* Only the field itself is tinted: the check is a control acting on the field, not part
          of the thing being typed into. */}
      <span className="flex min-h-5 min-w-0 flex-1 items-center rounded bg-accent px-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(branch);
              setError(null);
              setEditing(false);
            }
            // The pane sits inside a list with its own key handling; an edit is not a shortcut.
            e.stopPropagation();
          }}
          spellCheck={false}
          autoComplete="off"
          className={cn(FIELD, 'min-w-0 flex-1', error && 'text-destructive')}
          aria-label="Branch name"
          // Focused because a click on the value is what put it here.
          autoFocus
        />
      </span>
      {error && (
        <span className="shrink-0 text-[10px] text-destructive">{error}</span>
      )}
      <button
        type="button"
        // mousedown, not click: the input is focused, and confirming has to survive the blur
        // that pressing this button causes.
        onMouseDown={(e) => {
          e.preventDefault();
          commit();
        }}
        disabled={rename.isPending || invalid || unchanged}
        aria-label="Apply branch name"
        title="Apply"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <Check className="h-3 w-3" />
      </button>
    </span>
  );
}

/**
 * The branch this attempt is based on, switched in place.
 *
 * A searchable list rather than a plain select: a repository of any age has more branches than
 * fit in a menu, and the one you want is known by name.
 */
export function BaseBranchField({
  attemptId,
  repoId,
  targetBranch,
  disabled,
}: {
  attemptId: string;
  repoId: string | null | undefined;
  targetBranch: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation('tasks');
  const [open, setOpen] = useState(false);
  const git = useGitOperations(attemptId, repoId ?? undefined);
  const { data: branches = [] } = useRepoBranches(repoId ?? null, {
    // Only worth fetching once someone reaches for the list.
    enabled: open,
  });

  // Local branches first: the base is usually one of them, and remote duplicates of the same
  // name would otherwise sit above it.
  const ordered = useMemo(
    () =>
      [...branches].sort((a, b) => Number(a.is_remote) - Number(b.is_remote)),
    [branches]
  );

  const select = async (name: string) => {
    setOpen(false);
    if (!repoId || name === targetBranch) return;
    await git.actions.changeTargetBranch({ newTargetBranch: name, repoId });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={t('branches.changeTarget.dialog.title')}
          className={cn(
            HOVERABLE,
            'w-full min-w-0 text-left disabled:pointer-events-none disabled:opacity-50 disabled:hover:bg-transparent',
            open && 'bg-accent'
          )}
        >
          <span className="min-w-0 truncate">{targetBranch}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-56 p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <Command loop>
          <div className="flex items-center gap-2 border-b px-2.5 py-1.5">
            <GitBranchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Command.Input
              placeholder="Change base…"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-2.5 text-center text-xs text-muted-foreground">
              No matching branch
            </Command.Empty>
            {ordered.map((b) => (
              <Command.Item
                key={`${b.is_remote ? 'r' : 'l'}:${b.name}`}
                value={b.name}
                onSelect={() => select(b.name)}
                className="flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1 text-xs data-[selected=true]:bg-accent"
              >
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                {b.is_remote && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    remote
                  </span>
                )}
                {b.name === targetBranch && (
                  <Check className="h-3 w-3 shrink-0" />
                )}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
