// Re-export types for backward compatibility
export type {
  AddEntryType,
  AggregatedDiffGroup,
  AggregatedPatchGroup,
  DisplayEntry,
  OnEntriesUpdated,
  PatchTypeWithKey,
} from './types';
export { isAggregatedDiffGroup, isAggregatedGroup } from './types';

// Re-export the old UI hook with original name for backward compatibility
export { useConversationHistoryOld as useConversationHistory } from './useConversationHistoryOld';
