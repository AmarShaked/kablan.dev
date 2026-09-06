import type {
  AggregatedDiffGroup,
  AggregatedPatchGroup,
  DisplayEntry,
  PatchTypeWithKey,
} from '@/hooks/useConversationHistory';
import type { NormalizedEntry } from 'shared/types';

/**
 * Collapse consecutive completed tools and consecutive file edits so a turn
 * of “read, grep, bash, edit, edit” is two rows instead of five.
 *
 * A single item stays itself. Approval prompts, setup scripts, plans, and
 * anything that is not a completed tool_use break the run.
 */

const MIN_GROUP = 2;

const SCRIPT_TOOL_NAMES = new Set([
  'Setup Script',
  'Cleanup Script',
  'Archive Script',
  'Tool Install Script',
]);

type RunKind = 'tool' | 'change';

function normalizedContent(
  entry: PatchTypeWithKey
): NormalizedEntry | undefined {
  if (entry.type !== 'NORMALIZED_ENTRY') return undefined;
  return entry.content;
}

function classify(entry: PatchTypeWithKey): RunKind | 'break' {
  const content = normalizedContent(entry);
  const entryType = content?.entry_type;
  if (entryType?.type !== 'tool_use') return 'break';
  if (entryType.status?.status === 'pending_approval') return 'break';
  if (entryType.action_type?.action === 'plan_presentation') return 'break';
  if (
    entryType.action_type?.action === 'command_run' &&
    SCRIPT_TOOL_NAMES.has(entryType.tool_name)
  ) {
    return 'break';
  }
  if (entryType.action_type?.action === 'file_edit') return 'change';
  return 'tool';
}

function flushRun(kind: RunKind, run: PatchTypeWithKey[], out: DisplayEntry[]) {
  if (run.length === 0) return;
  if (run.length < MIN_GROUP) {
    out.push(...run);
    return;
  }

  if (kind === 'change') {
    const group: AggregatedDiffGroup = {
      type: 'AGGREGATED_DIFF_GROUP',
      entries: run,
      patchKey: `change-group-${run[0].patchKey}`,
      executionProcessId: run[0].executionProcessId,
    };
    out.push(group);
    return;
  }

  const group: AggregatedPatchGroup = {
    type: 'AGGREGATED_GROUP',
    aggregationType: 'tool_call',
    entries: run,
    patchKey: `tool-group-${run[0].patchKey}`,
    executionProcessId: run[0].executionProcessId,
  };
  out.push(group);
}

export function groupConversationEntries(
  entries: PatchTypeWithKey[]
): DisplayEntry[] {
  const out: DisplayEntry[] = [];
  let run: PatchTypeWithKey[] = [];
  let runKind: RunKind | null = null;

  const flush = () => {
    if (runKind) flushRun(runKind, run, out);
    run = [];
    runKind = null;
  };

  for (const entry of entries) {
    const kind = classify(entry);
    if (kind === 'break') {
      flush();
      out.push(entry);
      continue;
    }
    if (runKind !== kind) {
      flush();
      runKind = kind;
    }
    run.push(entry);
  }
  flush();

  return out;
}
