import { describe, expect, it } from 'vitest';
import type { ActionType, NormalizedEntry, ToolStatus } from 'shared/types';
import type { PatchTypeWithKey } from '@/hooks/useConversationHistory';
import {
  isAggregatedDiffGroup,
  isAggregatedGroup,
} from '@/hooks/useConversationHistory/types';
import { groupConversationEntries } from './groupConversationEntries';

let seq = 0;

function toolEntry(
  action: ActionType,
  extras: {
    toolName?: string;
    status?: ToolStatus['status'];
    content?: string;
  } = {}
): PatchTypeWithKey {
  seq += 1;
  const content: NormalizedEntry = {
    timestamp: null,
    content: extras.content ?? '',
    entry_type: {
      type: 'tool_use',
      tool_name: extras.toolName ?? action.action,
      action_type: action,
      status: { status: extras.status ?? 'success' } as ToolStatus,
    },
  };
  return {
    type: 'NORMALIZED_ENTRY',
    content,
    patchKey: `p${seq}`,
    executionProcessId: 'proc-1',
  };
}

function assistant(text: string): PatchTypeWithKey {
  seq += 1;
  return {
    type: 'NORMALIZED_ENTRY',
    content: {
      timestamp: null,
      content: text,
      entry_type: { type: 'assistant_message' },
    },
    patchKey: `p${seq}`,
    executionProcessId: 'proc-1',
  };
}

const read = (path: string) => toolEntry({ action: 'file_read', path });
const search = (query: string) => toolEntry({ action: 'search', query });
const command = (cmd: string, toolName = 'Bash') =>
  toolEntry(
    { action: 'command_run', command: cmd, result: null },
    { toolName }
  );
const edit = (path: string) =>
  toolEntry({
    action: 'file_edit',
    path,
    changes: [{ action: 'edit', unified_diff: '', has_line_numbers: true }],
  });

describe('groupConversationEntries', () => {
  it('leaves a single tool ungrouped', () => {
    const entries = [read('a.ts')];
    expect(groupConversationEntries(entries)).toEqual(entries);
  });

  it('collapses consecutive non-edit tools into one tool-call group', () => {
    const entries = [read('a.ts'), search('foo'), command('git status')];
    const grouped = groupConversationEntries(entries);
    expect(grouped).toHaveLength(1);
    expect(isAggregatedGroup(grouped[0])).toBe(true);
    if (!isAggregatedGroup(grouped[0])) return;
    expect(grouped[0].aggregationType).toBe('tool_call');
    expect(grouped[0].entries).toHaveLength(3);
  });

  it('collapses consecutive file edits into one change group', () => {
    const entries = [edit('a.ts'), edit('b.tsx'), edit('c.json')];
    const grouped = groupConversationEntries(entries);
    expect(grouped).toHaveLength(1);
    expect(isAggregatedDiffGroup(grouped[0])).toBe(true);
    if (!isAggregatedDiffGroup(grouped[0])) return;
    expect(grouped[0].entries).toHaveLength(3);
  });

  it('leaves a single file edit ungrouped', () => {
    const entries = [edit('a.ts')];
    expect(groupConversationEntries(entries)).toEqual(entries);
  });

  it('breaks a tool run on assistant text', () => {
    const entries = [
      read('a.ts'),
      read('b.ts'),
      assistant('done'),
      search('x'),
      search('y'),
    ];
    const grouped = groupConversationEntries(entries);
    expect(grouped).toHaveLength(3);
    expect(isAggregatedGroup(grouped[0])).toBe(true);
    expect(grouped[1]).toEqual(entries[2]);
    expect(isAggregatedGroup(grouped[2])).toBe(true);
  });

  it('still groups tools that have not reported a status yet', () => {
    const bare = (path: string, key: string): PatchTypeWithKey =>
      ({
        type: 'NORMALIZED_ENTRY',
        patchKey: key,
        executionProcessId: 'proc-1',
        content: {
          timestamp: null,
          content: '',
          entry_type: {
            type: 'tool_use',
            tool_name: 'Read',
            action_type: { action: 'file_read', path },
          },
        },
      }) as unknown as PatchTypeWithKey;
    const grouped = groupConversationEntries([
      bare('a.ts', 'a'),
      bare('b.ts', 'b'),
    ]);
    expect(grouped).toHaveLength(1);
    expect(isAggregatedGroup(grouped[0])).toBe(true);
  });

  it('does not fold a pending-approval tool into a group', () => {
    const pending = toolEntry(
      { action: 'command_run', command: 'rm -rf /', result: null },
      { status: 'pending_approval' }
    );
    const entries = [read('a.ts'), pending, read('b.ts')];
    const grouped = groupConversationEntries(entries);
    expect(grouped).toEqual(entries);
  });

  it('does not fold setup scripts into tool calls', () => {
    const setup = command('npm install', 'Setup Script');
    const entries = [setup, command('npm test', 'Setup Script')];
    expect(groupConversationEntries(entries)).toEqual(entries);
  });

  it('splits tools and file edits into separate groups', () => {
    const entries = [
      read('a.ts'),
      search('foo'),
      edit('a.ts'),
      edit('b.ts'),
      command('git diff'),
      command('git status'),
    ];
    const grouped = groupConversationEntries(entries);
    expect(grouped).toHaveLength(3);
    expect(isAggregatedGroup(grouped[0])).toBe(true);
    expect(isAggregatedDiffGroup(grouped[1])).toBe(true);
    expect(isAggregatedGroup(grouped[2])).toBe(true);
  });
});
