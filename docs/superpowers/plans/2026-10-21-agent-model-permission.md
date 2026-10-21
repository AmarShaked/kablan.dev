# Agent, model, and permission implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace saved executor profiles with an agent, model, and permission chosen on the new-task dialog and the follow-up composer.

**Architecture:** `AgentRunSelection` is the value that starts a run. Spawn builds a `CodingAgent` from it. Model lists are fetched at server startup into `model-cache.json` and reused for the local calendar day. User config v9 stores `last_agent_selection`, written only when a task is created.

**Tech Stack:** Rust workspace (executors, services, server), React + TypeScript, ts-rs.

**Spec:** `docs/superpowers/specs/2026-10-21-agent-model-permission-design.md`

## Global Constraints

- Permission names: Auto, Manual, Accept edits, Plan, Bypass.
- A mode an agent cannot do is omitted. Switching to such an agent selects Manual.
- Follow-up agent is fixed. Model and permission can change. A different agent is rejected.
- `last_agent_selection` is written only when a new task is created.
- Models are fetched on server startup and cached for the local calendar day. A same-day restart does not call the agents again.
- `model: null` is the agent default and the label is “Default”.
- Do not hand-edit `shared/types.ts`. Regenerate it.
- No effort control. Do not delete `profiles.json`.

## Review Focus

- Claude Plan must not also pass bypass. A person choosing Plan expects a plan, not skipped permissions.
- A failed model fetch stored for today must show “Couldn’t load models”, not an empty menu that looks like the agent has no models.
- A follow-up must not change the selection the next new task opens on.
- Switching agent must drop a model id the new cache does not contain, and must select Manual when the current permission is missing.
- An old execution row with variant `PLAN` or `APPROVALS` must still be readable when `profiles.json` has no matching variant.

### Task 1: Selection and permission mapping

**Files:**
- Create: `crates/executors/src/selection.rs`
- Modify: `crates/executors/src/lib.rs`
- Modify: `crates/executors/src/executors/claude.rs`
- Modify: `crates/executors/src/executors/claude/types.rs`
- Modify: `crates/executors/src/command.rs`
- Test: `crates/executors/src/selection.rs`

**Interfaces:**
- Produces: `PermissionLevel`, `AgentRunSelection`, `supported_permissions(BaseCodingAgent) -> &'static [PermissionLevel]`, `adjust_permission(BaseCodingAgent, PermissionLevel) -> PermissionLevel`, `coding_agent_from_selection(&AgentRunSelection) -> Result<CodingAgent, String>`, `selection_asks_in_app(&AgentRunSelection) -> bool`, `selection_from_legacy(BaseCodingAgent, Option<&str>, Option<&serde_json::Value>) -> AgentRunSelection`

- [ ] Write failing tests for the mapping table, Claude plan versus bypass command args, Manual fallback, and legacy profile reads.
- [ ] Run `cargo test -p executors selection:: -- --test-threads=8` and confirm failure.
- [ ] Implement the types, the mapping, and the Claude command change.
- [ ] Re-run the same tests and confirm they pass.

### Task 2: Daily model cache

**Files:**
- Create: `crates/executors/src/model_cache.rs`
- Modify: `crates/executors/src/lib.rs`
- Test: `crates/executors/src/model_cache.rs`

**Interfaces:**
- Produces: `ListedModel { id, label, featured }`, `ModelCacheFile`, `refresh_model_cache(path, today, installed, fetch) -> ModelCacheFile`, `parse_claude_catalog(&str) -> Result<Vec<ListedModel>, String>`, `parse_cursor_model_list(&str) -> Vec<ListedModel>`, `cache_response(path, today) -> ModelCacheResponse { ready, fetched_on, agents }`

- [ ] Write failing tests: same-day skip, next-day refetch, stored error is not retried the same day, uninstalled agents are absent, Claude main versus overflow, a flat list has no secondary group.
- [ ] Run `cargo test -p executors model_cache::`.
- [ ] Implement and re-run until they pass.

### Task 3: Persist the selection and serve the cache

**Files:**
- Create: `crates/services/src/services/config/versions/v9.rs`
- Modify: config version module and `config/mod.rs` type aliases
- Modify: coding-agent initial, follow-up, and review actions to spawn from `agent_selection` when present
- Modify: `start_workspace` and the create-task, follow-up, review, and conflict routes to take `AgentRunSelection`
- Modify: `crates/server/src/run.rs` to refresh the cache at startup without blocking requests
- Modify: `crates/server/src/routes/config.rs` to add `GET /agent-models`
- Modify: `crates/server/src/bin/generate_types.rs`

**Interfaces:**
- Consumes: Task 1 and Task 2
- Produces: config field `last_agent_selection`; request field `agent_selection` on new runs; `GET /api/agent-models`

- [ ] Test v9 migration from a v8 config plus a sample profiles document, including `PLAN` and `APPROVALS` with no matching variant.
- [ ] Creating a task writes `last_agent_selection`. The follow-up route does not, and it still rejects a different agent.
- [ ] Run `cargo test -p services config::` and `cargo test -p server --lib` for the new cases.

### Task 4: Composer footer and remove profile editing

**Files:**
- Create: `frontend/src/components/tasks/AgentRunControls.tsx`
- Create: `frontend/src/components/tasks/agentRun.test.ts`
- Modify: `TaskFormDialog.tsx`, `TaskFollowUpSection.tsx`, review and conflict dialogs, `AgentPage.tsx`, settings agent sections
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes: `AgentRunSelection` and `GET /api/agent-models`

- [ ] Tests: new-task footer order; agent switch drops an unknown model and selects Manual; follow-up renders the agent as text; `ready: false` shows the loading label.
- [ ] Implement the footer. New task writes through the create API. Follow-up sends model and permission with the task’s agent.
- [ ] Remove the profile editor from the Agents page and settings. Launchers that used a profile selector send the task’s latest selection and do not offer an agent picker.

### Task 5: Local validation

- [ ] `cargo test -p executors selection:: model_cache::`
- [ ] `pnpm run generate-types`
- [ ] `pnpm run check` and the frontend tests for `agentRun`
- [ ] `pnpm run dev`, confirm `model-cache.json` is dated today, restart once and confirm the listing commands are not run again, then create a task and send a follow-up through the new footer.
