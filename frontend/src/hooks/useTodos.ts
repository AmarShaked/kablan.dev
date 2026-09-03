import { useMemo } from 'react';
import type { TodoItem, NormalizedEntry } from 'shared/types';
import type { PatchTypeWithKey } from '@/hooks/useConversationHistory';

interface UseTodosResult {
  todos: TodoItem[];
  inProgressTodo: TodoItem | null;
  lastUpdated: string | null;
  /**
   * Whether any todo is still waiting on the agent. The list is read from the whole
   * conversation, so a finished one lingers past the turn that wrote it — and past the next
   * session started in the same workspace. Nothing outstanding means nothing left to track.
   */
  hasOutstanding: boolean;
}

/**
 * Hook that extracts and maintains the latest TODO state from normalized conversation entries.
 * Filters for TodoManagement ActionType entries and returns the most recent todo list,
 * along with the currently in-progress todo item.
 */
export const useTodos = (entries: PatchTypeWithKey[]): UseTodosResult => {
  return useMemo(() => {
    let latestTodos: TodoItem[] = [];
    let lastUpdatedTime: string | null = null;

    for (const entry of entries) {
      if (entry.type === 'NORMALIZED_ENTRY' && entry.content) {
        const normalizedEntry = entry.content as NormalizedEntry;

        if (
          normalizedEntry.entry_type?.type === 'tool_use' &&
          normalizedEntry.entry_type?.action_type?.action === 'todo_management'
        ) {
          const actionType = normalizedEntry.entry_type.action_type;
          const partialTodos = actionType.todos || [];
          const currentTimestamp =
            normalizedEntry.timestamp || new Date().toISOString();

          // Only update latestTodos if we have meaningful content OR this is our first entry
          const hasMeaningfulTodos =
            partialTodos.length > 0 &&
            partialTodos.every(
              (todo: TodoItem) =>
                todo.content && todo.content.trim().length > 0 && todo.status
            );
          const isNewerThanLatest =
            !lastUpdatedTime || currentTimestamp >= lastUpdatedTime;

          if (
            hasMeaningfulTodos ||
            (isNewerThanLatest && latestTodos.length === 0)
          ) {
            latestTodos = partialTodos;
            lastUpdatedTime = currentTimestamp;
          }
        }
      }
    }

    // Find the currently in-progress todo
    const inProgressTodo =
      latestTodos.find((todo) => {
        const status = todo.status?.toLowerCase();
        return status === 'in_progress' || status === 'in-progress';
      }) ?? null;

    // Cancelled counts as settled: the agent decided against it, so it is not pending work.
    const hasOutstanding = latestTodos.some((todo) => {
      const status = todo.status?.toLowerCase();
      return status !== 'completed' && status !== 'cancelled';
    });

    return {
      todos: latestTodos,
      inProgressTodo,
      lastUpdated: lastUpdatedTime,
      hasOutstanding,
    };
  }, [entries]);
};
