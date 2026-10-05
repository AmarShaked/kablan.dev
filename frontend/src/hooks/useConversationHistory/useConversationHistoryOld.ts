import type { TokenUsageInfo } from 'shared/types';
import {
  CommandExitStatus,
  ExecutionProcess,
  ExecutionProcessStatus,
  NormalizedEntry,
  PatchType,
  ToolStatus,
} from 'shared/types';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { streamJsonPatchEntries } from '@/utils/streamJsonPatchEntries';
import type {
  AddEntryType,
  ExecutionProcessStateStore,
  OnEntriesUpdated,
  PatchTypeWithKey,
  UseConversationHistoryParams,
  UseConversationHistoryResult,
} from './types';
import {
  makeLoadingPatch,
  MIN_INITIAL_ENTRIES,
  nextActionPatch,
  REMAINING_BATCH_SIZE,
} from './constants';
import { isClaudeLoginError } from '@/utils/claudeLoginError';

export const useConversationHistoryOld = ({
  attempt,
  onEntriesUpdated,
  onTokenUsage,
}: UseConversationHistoryParams): UseConversationHistoryResult => {
  const {
    executionProcessesVisible: executionProcessesRaw,
    isLoading: processesLoading,
  } = useExecutionProcessesContext();
  const executionProcesses = useRef<ExecutionProcess[]>(executionProcessesRaw);
  const displayedExecutionProcesses = useRef<ExecutionProcessStateStore>({});
  const loadedInitialEntries = useRef(false);
  const streamingProcessIdsRef = useRef<Set<string>>(new Set());
  const onEntriesUpdatedRef = useRef<OnEntriesUpdated | null>(null);
  const onTokenUsageRef =
    useRef<UseConversationHistoryParams['onTokenUsage']>(undefined);
  /** The last context report the agent sent, kept because the entries carrying it are dropped. */
  const latestTokenUsageRef = useRef<TokenUsageInfo | null>(null);

  const mergeIntoDisplayed = (
    mutator: (state: ExecutionProcessStateStore) => void
  ) => {
    const state = displayedExecutionProcesses.current;
    mutator(state);
  };
  useEffect(() => {
    onEntriesUpdatedRef.current = onEntriesUpdated;
    onTokenUsageRef.current = onTokenUsage;
  }, [onEntriesUpdated]);

  // Keep executionProcesses up to date
  useEffect(() => {
    executionProcesses.current = executionProcessesRaw.filter(
      (ep) =>
        ep.run_reason === 'setupscript' ||
        ep.run_reason === 'cleanupscript' ||
        ep.run_reason === 'archivescript' ||
        ep.run_reason === 'codingagent'
    );
  }, [executionProcessesRaw]);

  const loadEntriesForHistoricExecutionProcess = (
    executionProcess: ExecutionProcess
  ) => {
    let url = '';
    if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
      url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
    } else {
      url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;
    }

    return new Promise<PatchType[]>((resolve) => {
      const controller = streamJsonPatchEntries<PatchType>(url, {
        onFinished: (allEntries) => {
          controller.close();
          resolve(allEntries);
        },
        onError: (err) => {
          console.warn(
            `Error loading entries for historic execution process ${executionProcess.id}`,
            err
          );
          controller.close();
          resolve([]);
        },
      });
    });
  };

  const getLiveExecutionProcess = (
    executionProcessId: string
  ): ExecutionProcess | undefined => {
    return executionProcesses?.current.find(
      (executionProcess) => executionProcess.id === executionProcessId
    );
  };

  const patchWithKey = (
    patch: PatchType,
    executionProcessId: string,
    index: number | 'user'
  ) => {
    return {
      ...patch,
      patchKey: `${executionProcessId}:${index}`,
      executionProcessId,
    };
  };

  const flattenEntries = (
    executionProcessState: ExecutionProcessStateStore
  ): PatchTypeWithKey[] => {
    return Object.values(executionProcessState)
      .filter(
        (p) =>
          p.executionProcess.executor_action.typ.type ===
            'CodingAgentFollowUpRequest' ||
          p.executionProcess.executor_action.typ.type ===
            'CodingAgentInitialRequest' ||
          p.executionProcess.executor_action.typ.type === 'ReviewRequest'
      )
      .sort(
        (a, b) =>
          new Date(
            a.executionProcess.created_at as unknown as string
          ).getTime() -
          new Date(b.executionProcess.created_at as unknown as string).getTime()
      )
      .flatMap((p) => p.entries);
  };

  const getActiveAgentProcesses = (): ExecutionProcess[] => {
    return (
      executionProcesses?.current.filter(
        (p) =>
          p.status === ExecutionProcessStatus.running &&
          p.run_reason !== 'devserver'
      ) ?? []
    );
  };

  const flattenEntriesForEmit = useCallback(
    (executionProcessState: ExecutionProcessStateStore): PatchTypeWithKey[] => {
      // Flags to control Next Action bar emit
      let hasPendingApproval = false;
      let hasRunningProcess = false;
      let lastProcessFailedOrKilled = false;
      let needsSetup = false;
      let setupHelpText: string | undefined;
      let claudeLoginProcessId: string | undefined;

      // Create user messages + tool calls for setup/cleanup scripts
      const allEntries = Object.values(executionProcessState)
        .sort(
          (a, b) =>
            new Date(
              a.executionProcess.created_at as unknown as string
            ).getTime() -
            new Date(
              b.executionProcess.created_at as unknown as string
            ).getTime()
        )
        .flatMap((p, index) => {
          const entries: PatchTypeWithKey[] = [];
          if (
            p.executionProcess.executor_action.typ.type ===
              'CodingAgentInitialRequest' ||
            p.executionProcess.executor_action.typ.type ===
              'CodingAgentFollowUpRequest' ||
            p.executionProcess.executor_action.typ.type === 'ReviewRequest'
          ) {
            // New user message
            const actionType = p.executionProcess.executor_action.typ;
            const userNormalizedEntry: NormalizedEntry = {
              entry_type: {
                type: 'user_message',
              },
              content: actionType.prompt,
              timestamp: null,
            };
            const userPatch: PatchType = {
              type: 'NORMALIZED_ENTRY',
              content: userNormalizedEntry,
            };
            const userPatchTypeWithKey = patchWithKey(
              userPatch,
              p.executionProcess.id,
              'user'
            );
            entries.push(userPatchTypeWithKey);

            // The agent reports its context size as an entry; keep the last one before the
            // entries carrying it are dropped, so something can say what the next turn costs.
            for (const e of p.entries) {
              // Narrowed and optional at every hop: this list can hold an undefined element or
              // a partial entry, and a throw here is a throw during render — the whole tree,
              // not one component. A token count is not worth that.
              if (e?.type !== 'NORMALIZED_ENTRY') continue;
              const usage = e.content?.entry_type;
              if (usage?.type === 'token_usage_info') {
                latestTokenUsageRef.current = {
                  total_tokens: usage.total_tokens,
                  model_context_window: usage.model_context_window,
                };
              }
            }

            // Remove user messages (replaced with custom one) and token usage info (displayed separately)
            const filteredEntries = p.entries.filter(
              (e) =>
                e.type !== 'NORMALIZED_ENTRY' ||
                (e.content.entry_type.type !== 'user_message' &&
                  e.content.entry_type.type !== 'token_usage_info')
            );

            const hasPendingApprovalEntry = filteredEntries.some((entry) => {
              if (entry.type !== 'NORMALIZED_ENTRY') return false;
              const entryType = entry.content.entry_type;
              return (
                entryType.type === 'tool_use' &&
                entryType.status.status === 'pending_approval'
              );
            });

            if (hasPendingApprovalEntry) {
              hasPendingApproval = true;
            }

            entries.push(...filteredEntries);

            const liveProcessStatus = getLiveExecutionProcess(
              p.executionProcess.id
            )?.status;
            const isProcessRunning =
              liveProcessStatus === ExecutionProcessStatus.running;
            const processFailedOrKilled =
              liveProcessStatus === ExecutionProcessStatus.failed ||
              liveProcessStatus === ExecutionProcessStatus.killed;

            if (isProcessRunning) {
              hasRunningProcess = true;
            }

            if (
              processFailedOrKilled &&
              index === Object.keys(executionProcessState).length - 1
            ) {
              lastProcessFailedOrKilled = true;

              // Check if this failed process has a SetupRequired entry
              const hasSetupRequired = filteredEntries.some((entry) => {
                if (entry.type !== 'NORMALIZED_ENTRY') return false;
                if (
                  entry.content.entry_type.type === 'error_message' &&
                  entry.content.entry_type.error_type.type === 'setup_required'
                ) {
                  setupHelpText = entry.content.content;
                  return true;
                }
                return false;
              });

              if (hasSetupRequired) {
                needsSetup = true;
              }

              const hasClaudeLoginError = filteredEntries.some((entry) => {
                if (entry.type !== 'NORMALIZED_ENTRY') return false;
                return (
                  entry.content.entry_type.type === 'error_message' &&
                  isClaudeLoginError(entry.content.content)
                );
              });
              if (hasClaudeLoginError) {
                claudeLoginProcessId = p.executionProcess.id;
              }
            }

            if (isProcessRunning && !hasPendingApprovalEntry) {
              entries.push(makeLoadingPatch(p.executionProcess.id));
            }
          } else if (
            p.executionProcess.executor_action.typ.type === 'ScriptRequest'
          ) {
            // Add setup and cleanup script as a tool call
            let toolName = '';
            switch (p.executionProcess.executor_action.typ.context) {
              case 'SetupScript':
                toolName = 'Setup Script';
                break;
              case 'CleanupScript':
                toolName = 'Cleanup Script';
                break;
              case 'ArchiveScript':
                toolName = 'Archive Script';
                break;
              case 'ToolInstallScript':
                toolName = 'Tool Install Script';
                break;
              default:
                return [];
            }

            const executionProcess = getLiveExecutionProcess(
              p.executionProcess.id
            );

            if (executionProcess?.status === ExecutionProcessStatus.running) {
              hasRunningProcess = true;
            }

            if (
              (executionProcess?.status === ExecutionProcessStatus.failed ||
                executionProcess?.status === ExecutionProcessStatus.killed) &&
              index === Object.keys(executionProcessState).length - 1
            ) {
              lastProcessFailedOrKilled = true;
            }

            const exitCode = Number(executionProcess?.exit_code) || 0;
            const exit_status: CommandExitStatus | null =
              executionProcess?.status === 'running'
                ? null
                : {
                    type: 'exit_code',
                    code: exitCode,
                  };

            const toolStatus: ToolStatus =
              executionProcess?.status === ExecutionProcessStatus.running
                ? { status: 'created' }
                : exitCode === 0
                  ? { status: 'success' }
                  : { status: 'failed' };

            const output = p.entries.map((line) => line.content).join('\n');

            const toolNormalizedEntry: NormalizedEntry = {
              entry_type: {
                type: 'tool_use',
                tool_name: toolName,
                action_type: {
                  action: 'command_run',
                  command: p.executionProcess.executor_action.typ.script,
                  result: {
                    output,
                    exit_status,
                  },
                },
                status: toolStatus,
              },
              content: toolName,
              timestamp: null,
            };
            const toolPatch: PatchType = {
              type: 'NORMALIZED_ENTRY',
              content: toolNormalizedEntry,
            };
            const toolPatchWithKey: PatchTypeWithKey = patchWithKey(
              toolPatch,
              p.executionProcess.id,
              0
            );

            entries.push(toolPatchWithKey);
          }

          return entries;
        });

      // Emit the next action bar if no process running
      if (!hasRunningProcess && !hasPendingApproval) {
        allEntries.push(
          nextActionPatch(
            lastProcessFailedOrKilled,
            Object.keys(executionProcessState).length,
            needsSetup,
            setupHelpText,
            claudeLoginProcessId
          )
        );
      }

      return allEntries;
    },
    []
  );

  const emitEntries = useCallback(
    (
      executionProcessState: ExecutionProcessStateStore,
      addEntryType: AddEntryType,
      loading: boolean
    ) => {
      const entries = flattenEntriesForEmit(executionProcessState);
      let modifiedAddEntryType = addEntryType;

      // Modify so that if add entry type is 'running' and last entry is a plan, emit special plan type
      if (entries.length > 0) {
        const lastEntry = entries[entries.length - 1];
        if (
          lastEntry.type === 'NORMALIZED_ENTRY' &&
          lastEntry.content.entry_type.type === 'tool_use' &&
          lastEntry.content.entry_type.tool_name === 'ExitPlanMode'
        ) {
          modifiedAddEntryType = 'plan';
        }
      }

      onEntriesUpdatedRef.current?.(entries, modifiedAddEntryType, loading);
      onTokenUsageRef.current?.(latestTokenUsageRef.current);
    },
    [flattenEntriesForEmit]
  );

  // Controllers for live streams, so a return to the tab can drop a frozen
  // socket. Closing rejects the waiter and the backoff opens a fresh one.
  const liveControllersRef = useRef<Map<string, { close: () => void }>>(
    new Map()
  );
  // Bumped when the attempt changes or this hook unmounts so a late patch
  // from the previous chat cannot paint into the next one.
  const streamGenerationRef = useRef(0);

  // This emits its own events as they are streamed
  const loadRunningAndEmit = useCallback(
    (executionProcess: ExecutionProcess): Promise<void> => {
      const generation = streamGenerationRef.current;
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          liveControllersRef.current.delete(executionProcess.id);
          fn();
        };
        const stillCurrent = () => streamGenerationRef.current === generation;

        let url = '';
        if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
          url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
        } else {
          url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;
        }
        const controller = streamJsonPatchEntries<PatchType>(url, {
          onEntries(entries) {
            if (!stillCurrent()) return;
            const patchesWithKey = entries.map((entry, index) =>
              patchWithKey(entry, executionProcess.id, index)
            );
            mergeIntoDisplayed((state) => {
              state[executionProcess.id] = {
                executionProcess,
                entries: patchesWithKey,
              };
            });
            emitEntries(displayedExecutionProcesses.current, 'running', false);
          },
          onFinished: () => {
            controller.close();
            finish(() => {
              if (stillCurrent()) {
                emitEntries(
                  displayedExecutionProcesses.current,
                  'running',
                  false
                );
              }
              resolve();
            });
          },
          onError: () => {
            controller.close();
            finish(() => reject());
          },
        });
        liveControllersRef.current.set(executionProcess.id, {
          close: () => {
            controller.close();
            // A frozen background socket never errors on its own. Reject so
            // the backoff loop reconnects instead of hanging forever.
            finish(() => reject(new Error('stream closed')));
          },
        });
      });
    },
    [emitEntries]
  );

  // Sometimes it can take a few seconds for the stream to start, wrap the loadRunningAndEmit method
  const loadRunningAndEmitWithBackoff = useCallback(
    async (executionProcess: ExecutionProcess) => {
      for (let i = 0; i < 20; i++) {
        try {
          await loadRunningAndEmit(executionProcess);
          break;
        } catch (_) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    },
    [loadRunningAndEmit]
  );

  const loadInitialEntries =
    useCallback(async (): Promise<ExecutionProcessStateStore> => {
      const localDisplayedExecutionProcesses: ExecutionProcessStateStore = {};

      if (!executionProcesses?.current) return localDisplayedExecutionProcesses;

      for (const executionProcess of [
        ...executionProcesses.current,
      ].reverse()) {
        if (executionProcess.status === ExecutionProcessStatus.running)
          continue;

        const entries =
          await loadEntriesForHistoricExecutionProcess(executionProcess);
        const entriesWithKey = entries.map((e, idx) =>
          patchWithKey(e, executionProcess.id, idx)
        );

        localDisplayedExecutionProcesses[executionProcess.id] = {
          executionProcess,
          entries: entriesWithKey,
        };

        if (
          flattenEntries(localDisplayedExecutionProcesses).length >
          MIN_INITIAL_ENTRIES
        ) {
          break;
        }
      }

      return localDisplayedExecutionProcesses;
    }, [executionProcesses]);

  const loadRemainingEntriesInBatches = useCallback(
    async (batchSize: number): Promise<boolean> => {
      if (!executionProcesses?.current) return false;

      let anyUpdated = false;
      for (const executionProcess of [
        ...executionProcesses.current,
      ].reverse()) {
        const current = displayedExecutionProcesses.current;
        if (
          current[executionProcess.id] ||
          executionProcess.status === ExecutionProcessStatus.running
        )
          continue;

        const entries =
          await loadEntriesForHistoricExecutionProcess(executionProcess);
        const entriesWithKey = entries.map((e, idx) =>
          patchWithKey(e, executionProcess.id, idx)
        );

        mergeIntoDisplayed((state) => {
          state[executionProcess.id] = {
            executionProcess,
            entries: entriesWithKey,
          };
        });

        if (
          flattenEntries(displayedExecutionProcesses.current).length > batchSize
        ) {
          anyUpdated = true;
          break;
        }
        anyUpdated = true;
      }
      return anyUpdated;
    },
    [executionProcesses]
  );

  const ensureProcessVisible = useCallback((p: ExecutionProcess) => {
    mergeIntoDisplayed((state) => {
      if (!state[p.id]) {
        state[p.id] = {
          executionProcess: {
            id: p.id,
            created_at: p.created_at,
            updated_at: p.updated_at,
            executor_action: p.executor_action,
          },
          entries: [],
        };
      }
    });
  }, []);

  const idListKey = useMemo(
    () => executionProcessesRaw?.map((p) => p.id).join(','),
    [executionProcessesRaw]
  );

  const idStatusKey = useMemo(
    () => executionProcessesRaw?.map((p) => `${p.id}:${p.status}`).join(','),
    [executionProcessesRaw]
  );

  // Reset before any load/stream effect for this attempt, so a late patch from
  // the previous chat is dropped and the new chat starts empty.
  useEffect(() => {
    streamGenerationRef.current += 1;
    for (const controller of liveControllersRef.current.values()) {
      controller.close();
    }
    liveControllersRef.current.clear();
    displayedExecutionProcesses.current = {};
    loadedInitialEntries.current = false;
    streamingProcessIdsRef.current.clear();
    emitEntries(displayedExecutionProcesses.current, 'initial', true);

    return () => {
      streamGenerationRef.current += 1;
      for (const controller of liveControllersRef.current.values()) {
        controller.close();
      }
      liveControllersRef.current.clear();
      streamingProcessIdsRef.current.clear();
    };
  }, [attempt.id, emitEntries]);

  // Initial load when attempt changes
  useEffect(() => {
    let cancelled = false;
    const generation = streamGenerationRef.current;
    (async () => {
      if (loadedInitialEntries.current) return;

      // Still waiting for the session process snapshot.
      if (processesLoading) return;

      // Task exists but nothing has run yet (e.g. chat-created TODO that never started).
      // Clear the loading overlay so the Next Action / empty state can show.
      if (executionProcesses.current.length === 0) {
        emitEntries(displayedExecutionProcesses.current, 'initial', false);
        loadedInitialEntries.current = true;
        return;
      }

      // Initial entries
      const allInitialEntries = await loadInitialEntries();
      if (cancelled || streamGenerationRef.current !== generation) return;
      mergeIntoDisplayed((state) => {
        Object.assign(state, allInitialEntries);
      });
      emitEntries(displayedExecutionProcesses.current, 'initial', false);
      loadedInitialEntries.current = true;

      // Then load the remaining in batches
      while (
        !cancelled &&
        streamGenerationRef.current === generation &&
        (await loadRemainingEntriesInBatches(REMAINING_BATCH_SIZE))
      ) {
        if (cancelled || streamGenerationRef.current !== generation) return;
      }
      if (cancelled || streamGenerationRef.current !== generation) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (cancelled || streamGenerationRef.current !== generation) return;
      emitEntries(displayedExecutionProcesses.current, 'historic', false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    attempt.id,
    idListKey,
    processesLoading,
    loadInitialEntries,
    loadRemainingEntriesInBatches,
    emitEntries,
  ]); // include idListKey so new processes trigger reload

  const startStreaming = useCallback(
    (activeProcess: ExecutionProcess) => {
      if (streamingProcessIdsRef.current.has(activeProcess.id)) return;
      streamingProcessIdsRef.current.add(activeProcess.id);
      loadRunningAndEmitWithBackoff(activeProcess).finally(() => {
        streamingProcessIdsRef.current.delete(activeProcess.id);
        liveControllersRef.current.delete(activeProcess.id);
      });
    },
    [loadRunningAndEmitWithBackoff]
  );

  useEffect(() => {
    const activeProcesses = getActiveAgentProcesses();
    if (activeProcesses.length === 0) return;

    for (const activeProcess of activeProcesses) {
      if (!displayedExecutionProcesses.current[activeProcess.id]) {
        const runningOrInitial =
          Object.keys(displayedExecutionProcesses.current).length > 1
            ? 'running'
            : 'initial';
        ensureProcessVisible(activeProcess);
        emitEntries(
          displayedExecutionProcesses.current,
          runningOrInitial,
          false
        );
      }

      if (activeProcess.status === ExecutionProcessStatus.running) {
        startStreaming(activeProcess);
      }
    }
  }, [
    attempt.id,
    idStatusKey,
    emitEntries,
    ensureProcessVisible,
    startStreaming,
  ]);

  // A backgrounded tab often freezes the chat socket without closing it. When
  // the page is visible again, drop any live stream so the backoff reconnects
  // and the transcript catches up instead of sitting half-drawn.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const activeProcesses = getActiveAgentProcesses();
      for (const activeProcess of activeProcesses) {
        if (activeProcess.status !== ExecutionProcessStatus.running) continue;
        const live = liveControllersRef.current.get(activeProcess.id);
        if (live) {
          live.close();
          continue;
        }
        // The previous stream gave up; start again now that the tab is back.
        startStreaming(activeProcess);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [startStreaming, idStatusKey]);

  // If an execution process is removed, remove it from the state
  useEffect(() => {
    if (!executionProcessesRaw) return;

    const removedProcessIds = Object.keys(
      displayedExecutionProcesses.current
    ).filter((id) => !executionProcessesRaw.some((p) => p.id === id));

    if (removedProcessIds.length > 0) {
      mergeIntoDisplayed((state) => {
        removedProcessIds.forEach((id) => {
          delete state[id];
        });
      });
    }
  }, [attempt.id, idListKey, executionProcessesRaw]);

  return {};
};
