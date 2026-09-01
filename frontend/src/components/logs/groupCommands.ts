import type {
  AggregatedPatchGroup,
  DisplayEntry,
  PatchTypeWithKey,
} from '@/hooks/useConversationHistory';

/**
 * Collapse runs of consecutive shell commands into one item.
 *
 * An agent exploring a repository fires the same command three or four times with slightly
 * different flags, and each one arrives as a full-width row carrying an absolute worktree path.
 * A dozen of those push the actual answer off the screen. Grouped, they take one line that says
 * how many there were and opens when you want them.
 *
 * Only consecutive commands group, and only when there is more than one — a single command is
 * clearer as itself than as a group of one. Anything that is not a plain command breaks the run,
 * so a group never hides an edit, a search result or an approval prompt behind a count.
 */

const MIN_GROUP = 2;

function isPlainCommand(entry: PatchTypeWithKey): boolean {
  if (entry.type !== 'NORMALIZED_ENTRY') return false;
  const content = (entry as { content?: unknown }).content as
    | { entry_type?: { type?: string; action_type?: { action?: string } } }
    | undefined;
  const entryType = content?.entry_type;
  if (entryType?.type !== 'tool_use') return false;
  if (entryType.action_type?.action !== 'command_run') return false;
  // A command waiting on approval is a question, not a log line — never fold it away.
  const status = (entryType as { status?: { status?: string } }).status;
  return status?.status !== 'pending_approval';
}

export function groupConsecutiveCommands(
  entries: PatchTypeWithKey[]
): DisplayEntry[] {
  const out: DisplayEntry[] = [];
  let run: PatchTypeWithKey[] = [];

  const flush = () => {
    if (run.length >= MIN_GROUP) {
      const group: AggregatedPatchGroup = {
        type: 'AGGREGATED_GROUP',
        // The shared group type predates this and only names read-ish actions; commands reuse
        // its shape rather than growing a fourth near-identical one.
        aggregationType: 'search',
        entries: run,
        patchKey: `cmd-group-${run[0].patchKey}`,
        executionProcessId: run[0].executionProcessId,
      };
      out.push(group);
    } else {
      out.push(...run);
    }
    run = [];
  };

  for (const entry of entries) {
    if (isPlainCommand(entry)) {
      run.push(entry);
    } else {
      flush();
      out.push(entry);
    }
  }
  flush();

  return out;
}
