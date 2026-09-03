import type { TokenUsageInfo } from 'shared/types';
import { ExecutorAction, PatchType, Workspace } from 'shared/types';

export type PatchTypeWithKey = PatchType & {
  patchKey: string;
  executionProcessId: string;
};

/**
 * A group of consecutive entries of the same aggregatable type (e.g., file_read, search, web_fetch).
 * Used to display multiple read/search/fetch operations in a collapsed accordion style.
 */
export type AggregatedPatchGroup = {
  type: 'AGGREGATED_GROUP';
  /** The aggregation category (e.g., 'file_read', 'search', 'web_fetch') */
  aggregationType: 'file_read' | 'search' | 'web_fetch';
  /** The individual entries in this group */
  entries: PatchTypeWithKey[];
  /** Unique key for the group */
  patchKey: string;
  executionProcessId: string;
};

/**
 * A group of consecutive file_edit entries for the same file path.
 * Used to display multiple edits to the same file in a collapsed accordion style.
 */
export type AggregatedDiffGroup = {
  type: 'AGGREGATED_DIFF_GROUP';
  /** The file path being edited */
  filePath: string;
  /** The individual file_edit entries in this group */
  entries: PatchTypeWithKey[];
  /** Unique key for the group */
  patchKey: string;
  executionProcessId: string;
};

/**
 * A group of thinking entries from a previous conversation turn.
 * Used to collapse thinking steps in previous answers for cleaner display.
 */
export type AggregatedThinkingGroup = {
  type: 'AGGREGATED_THINKING_GROUP';
  /** The individual thinking entries in this group */
  entries: PatchTypeWithKey[];
  /** Unique key for the group */
  patchKey: string;
  executionProcessId: string;
};

export type DisplayEntry =
  | PatchTypeWithKey
  | AggregatedPatchGroup
  | AggregatedDiffGroup
  | AggregatedThinkingGroup;

export function isAggregatedGroup(
  entry: DisplayEntry
): entry is AggregatedPatchGroup {
  return entry.type === 'AGGREGATED_GROUP';
}

export function isAggregatedDiffGroup(
  entry: DisplayEntry
): entry is AggregatedDiffGroup {
  return entry.type === 'AGGREGATED_DIFF_GROUP';
}

export function isAggregatedThinkingGroup(
  entry: DisplayEntry
): entry is AggregatedThinkingGroup {
  return entry.type === 'AGGREGATED_THINKING_GROUP';
}

export type AddEntryType = 'initial' | 'running' | 'historic' | 'plan';

export type OnEntriesUpdated = (
  newEntries: PatchTypeWithKey[],
  addType: AddEntryType,
  loading: boolean
) => void;

export type ExecutionProcessStaticInfo = {
  id: string;
  created_at: string;
  updated_at: string;
  executor_action: ExecutorAction;
};

export type ExecutionProcessState = {
  executionProcess: ExecutionProcessStaticInfo;
  entries: PatchTypeWithKey[];
};

export type ExecutionProcessStateStore = Record<string, ExecutionProcessState>;

export interface UseConversationHistoryParams {
  attempt: Workspace;
  onEntriesUpdated: OnEntriesUpdated;
  /**
   * The agent's own report of how much context it is carrying, when it sends one.
   *
   * These entries are stripped from the conversation before it is rendered — a token count is
   * not a message — but the number is the only thing that says what the next turn will cost,
   * so it is handed to the caller instead of dropped.
   */
  onTokenUsage?: (info: TokenUsageInfo | null) => void;
}

export interface UseConversationHistoryResult {}
