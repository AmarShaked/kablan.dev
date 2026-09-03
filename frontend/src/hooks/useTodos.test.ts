import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { TodoItem } from 'shared/types';
import type { PatchTypeWithKey } from '@/hooks/useConversationHistory';
import { useTodos } from './useTodos';

const todoEntry = (todos: TodoItem[], timestamp: string): PatchTypeWithKey =>
  ({
    type: 'NORMALIZED_ENTRY',
    patchKey: timestamp,
    content: {
      timestamp,
      entry_type: {
        type: 'tool_use',
        action_type: { action: 'todo_management', todos },
      },
    },
  }) as unknown as PatchTypeWithKey;

const todo = (content: string, status: string): TodoItem =>
  ({ content, status }) as TodoItem;

describe('useTodos', () => {
  it('reports work outstanding while the agent is still working through the list', () => {
    const { result } = renderHook(() =>
      useTodos([
        todoEntry(
          [todo('Create Linear ticket', 'completed'), todo('Open the MR', 'in_progress')],
          '2026-09-03T10:00:00Z'
        ),
      ])
    );

    expect(result.current.hasOutstanding).toBe(true);
    expect(result.current.inProgressTodo?.content).toBe('Open the MR');
  });

  /// The case this comes from: every item ticked off, yet the panel stayed above the composer
  /// for the rest of the attempt — and into the next session started in the same workspace.
  it('reports nothing outstanding once every item is ticked off', () => {
    const { result } = renderHook(() =>
      useTodos([
        todoEntry(
          [todo('Create Linear ticket', 'completed'), todo('Open the MR', 'completed')],
          '2026-09-03T10:00:00Z'
        ),
      ])
    );

    expect(result.current.todos).toHaveLength(2);
    expect(result.current.hasOutstanding).toBe(false);
  });

  it('treats a cancelled item as settled rather than pending', () => {
    const { result } = renderHook(() =>
      useTodos([
        todoEntry(
          [todo('Create Linear ticket', 'completed'), todo('Backport it', 'cancelled')],
          '2026-09-03T10:00:00Z'
        ),
      ])
    );

    expect(result.current.hasOutstanding).toBe(false);
  });

  it('follows the newest list, so a fresh todo revives the panel', () => {
    const { result } = renderHook(() =>
      useTodos([
        todoEntry([todo('Open the MR', 'completed')], '2026-09-03T10:00:00Z'),
        todoEntry(
          [todo('Open the MR', 'completed'), todo('Address review', 'pending')],
          '2026-09-03T11:00:00Z'
        ),
      ])
    );

    expect(result.current.hasOutstanding).toBe(true);
  });

  it('has nothing to report when the conversation carries no todos', () => {
    const { result } = renderHook(() => useTodos([]));

    expect(result.current.todos).toEqual([]);
    expect(result.current.hasOutstanding).toBe(false);
  });
});
