# Agent, model, and permission — no profiles

## Intent

Profiles bundle an agent, a pinned model, and a pile of flags under a name the user has to remember. Starting a task should be three choices on the message itself: which agent runs, which model it uses, and how freely it may act. The model list is whatever that installed agent can actually use, loaded once when the server starts and kept for the local day.

## Goals

- Remove the profile picker, the profile editor, and saved profile variants from the product.
- On the follow-up composer and in the new-task dialog, show a Claude-style footer: permission on the left, agent and model on the right.
- The model menu lists only the models cached for the selected agent.
- The permission menu uses one set of names. A mode that agent cannot do is absent.
- A follow-up starts from the model and permission the task last ran with. The agent is fixed for the life of the task and is shown as a label, not a control. Changing model or permission applies to that message and becomes what the next follow-up starts from. It does not change what the next new task opens on.
- A new task opens on the last selection saved by a new task. Creating a task writes that selection. The first run is Claude Code, no pinned model, Bypass.
- Switching agent in the new-task dialog, when the current permission is not one that agent offers, selects Manual.
- Existing saved profiles are read once and turned into that selection.
- The Agents page shows which agents are connected. It does not edit profiles.
- Tests are written first, then the implementation, then a local build and a walk through the real screens.

## Non-goals

- An effort control. The Claude screenshot’s “High” effort is not part of this.
- Custom command, appended prompt, extra params, env, or any other profile knob.
- Refetching models when the menu opens, or on a timer during the day.
- A model catalog checked into the repo as the source of truth.
- Deleting the user’s `profiles.json`. It stops being read for spawning and for the UI after migration.

## Anti-goals

- Leaving a profile picker on any path that starts an agent run.
- Showing models for an agent that is not installed.
- Keeping a model id after the user switches to an agent whose cache does not contain it.
- Caching a failed fetch so quietly that the menu looks like the agent has no models and the user cannot tell.

## Constraints

- Rust workspace plus the React frontend. Shared types come from `ts-rs`. Do not hand-edit `shared/types.ts`.
- Spawn still builds a `CodingAgent` and the existing command builders. The selection is translated into those fields at spawn time.
- User config is versioned. Current type is `versions::v8::Config` with `executor_profile: ExecutorProfileId`. This change adds v9.
- Execution processes store `executor_profile_id` today. New processes store the selection. Old rows stay readable.
- Tasks already run in their own worktree, which is why Bypass matches today’s DEFAULT profile.

## What was decided

- The three choices are agent, model, and permission.
- Footer layout is the Claude one, on both the follow-up box and the new-task dialog. Permission is a quiet label on the left. Agent and model are quiet labels on the right.
- Permission names, in order: Auto, Manual, Accept edits, Plan, Bypass. Descriptions match Claude: Auto is “handles permission decisions” and is marked Recommended when the agent offers it; Manual is “always ask before making changes”; Accept edits is “automatically accept all file edits”; Plan is “create a plan before making changes”; Bypass is “accepts all permissions”.
- Models are fetched when the server process starts and cached for the local calendar day. A second start on the same day does not call the agents again.
- Follow-ups inherit the task’s latest model and permission. The agent stays the one the task started with. The existing session check that rejects a different agent stays.
- Creating a new task saves `last_agent_selection`. Follow-ups, reviews, and conflict runs do not.
- If a new-task agent switch leaves a permission that agent does not offer, the footer selects Manual.
- The Agents page loses the profile editor. Extra profile knobs go away.
- Work order: this design, then tests, then implementation, then a local build and a pass through the whole flow.

## Calls

These are the builder’s calls, stated so they can be rejected.

### Selection

```text
AgentRunSelection {
  executor: BaseCodingAgent,
  model: Option<String>,
  permission: PermissionLevel,
}
```

`model: None` means the agent’s own default. The footer label is “Default”. Opening the cache does not rewrite `None` into the first model id. A picked model stores that id and the footer shows the cached label, falling back to the id.

Switching agent: if the current model id is missing from the new agent’s cache, set model back to `None`. If the current permission is not offered by the new agent, set permission to Manual.

First run, and any new task before the user has a saved selection: Claude Code, `model: None`, Bypass.

`last_agent_selection` on user config replaces `executor_profile`. It is written only when a new task is created, from the selection on that dialog. Follow-ups, reviews, and conflict runs do not write it.

### Permission mapping

`PermissionLevel` is `Auto | Manual | AcceptEdits | Plan | Bypass`.

The menu lists only the modes in the table below. Spawn sets only the fields named here. Every other `CodingAgent` field stays at its struct default, including append prompt and command overrides.

| Agent | Auto | Manual | Accept edits | Plan | Bypass |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `--permission-mode auto`, no approval service | existing `approvals: true` path (the app asks) | `--permission-mode acceptEdits`, no approval service | `--permission-mode plan`, no approval service | `dangerously_skip_permissions: true` |
| Codex | `sandbox: auto`, `ask_for_approval: on-request` | `sandbox: workspace-write`, `ask_for_approval: unless-trusted` | `sandbox: workspace-write`, `ask_for_approval: on-failure` | omitted | `sandbox: danger-full-access`, `ask_for_approval: never` |
| Gemini, Qwen | omitted | `yolo: false` and the approval service | omitted | omitted | `yolo: true` |
| Amp | omitted | `dangerously_allow_all: false` | omitted | omitted | `dangerously_allow_all: true` |
| OpenCode | omitted | `auto_approve: false` | omitted | `agent: "plan"`, `auto_approve: true` | `auto_approve: true` |
| Cursor | omitted | `force: false` | omitted | omitted | `force: true` |
| Copilot | omitted | `allow_all_tools: false` and the approval service | omitted | omitted | `allow_all_tools: true` |
| Droid | `autonomy: high` | `autonomy: normal` | `autonomy: medium` | omitted | `autonomy: skip-permissions-unsafe` |

Claude’s `PermissionMode` enum gains `Auto`. Plan mode must set plan, not the current behavior that also forces bypass. Bypass stays `--dangerously-skip-permissions`, which is today’s DEFAULT.

Codex reasoning-effort fields stay unset.

### Model cache

File: the same asset dir as `profiles.json`, named `model-cache.json`.

```text
{
  fetched_on: "YYYY-MM-DD",
  agents: {
    CLAUDE_CODE: {
      models: [{ id, label, featured }],
      error: null | string
    }
  }
}
```

`fetched_on` is the server machine’s local calendar date.

On server startup:

- If `fetched_on` is today, do not invoke any agent.
- Otherwise fetch every installed agent, then write the file with today’s date.
- An agent that is not installed is omitted, not stored as an error.
- An agent whose listing command fails is stored with `models: []` and `error` set to the failure text. That failure is part of today’s cache, so another start the same day does not retry it. The menu for that agent shows “Couldn’t load models” plus the error, and still lets the user run with model `None`.
- The next local calendar day fetches again, including agents that failed yesterday.

Each executor implements `list_models` by invoking that agent’s own binary or its local API, using the same login the spawn path uses. The returned records are `{ id, label, featured }`. The exact argv is written next to that executor. A static list in source is not the source of truth. Tests supply a fake runner and do not require the CLIs to be installed.

If the runner returns no featured flag, every model is `featured: true`. The menu is one flat list and has no “More models” row. If any model is not featured, the featured ones are the main list and the rest sit under “More models”.

`GET` the cache from one endpoint, for example `/api/agent-models`. The frontend never triggers a fetch. While the file is missing and startup has not finished, the endpoint returns an empty cache and `ready: false`, and the model label shows a loading state. Sending is still allowed with model `None`.

### Migration

Config becomes v9. `executor_profile` is replaced by `last_agent_selection`.

The migration reads `profiles.json` once, if it is there, and looks up the old `executor_profile` variant (missing variant means `DEFAULT`):

- Executor stays.
- Model is that variant’s `model` string when it has one, otherwise `None`.
- Permission is Plan when the variant sets Claude `plan` or OpenCode plan mode. It is Manual when the variant asks (`approvals`, `yolo: false`, `auto_approve: false`, `force: false`). It is Bypass when the variant skips permissions (`dangerously_skip_permissions`, `yolo: true`, `force: true`, `allow_all_tools`, `dangerously_allow_all`, Droid `skip-permissions-unsafe`). Anything else is Bypass.

Old execution-process rows keep `executor_profile_id`. On read, the same rules produce an `AgentRunSelection`. If `profiles.json` no longer contains that variant, executor is kept, model is `None`, and the variant name `PLAN` means Plan, `APPROVALS` means Manual, and every other name means Bypass.

New processes persist `AgentRunSelection` and do not write a profile id.

### Where the footer appears

One shared footer component.

- New-task dialog in `TaskFormDialog`. Permission, agent, and model are all controls. It replaces `ExecutorProfileSelector`. Creating the task writes `last_agent_selection`.
- Follow-up composer in `TaskFollowUpSection`. Permission and model are controls. The agent is a label. It replaces the variant control. `ComposerMenu` keeps attach and tags. Sending does not write `last_agent_selection`. The server still rejects a follow-up whose agent differs from the session.
- Review, conflict resolution, and any other launcher that currently embeds `ExecutorProfileSelector` do not offer an agent picker. They send the task’s agent plus the task’s latest model and permission. They do not write `last_agent_selection`.

No screen still offers a profile or a variant.

The Agents page and the settings agent screen drop `AgentProfilesPanel` and the profile form. What remains is the connected-agent list and install or login state.

Task create, follow-up, and the other run launchers take `AgentRunSelection` instead of `ExecutorProfileId`. Regenerate shared types after the Rust types change.

### Spawn

`get_coding_agent(profile)` is not used for new runs. A function builds a `CodingAgent` from `AgentRunSelection` using the mapping table. `model: None` omits the model flag. `model: Some` passes it through the executor’s existing model field.

## Tests, then implementation, then the local flow

Write these tests before the production code. They should fail first.

- Permission mapping: for each agent and each supported mode, the built `CodingAgent` has the fields in the table, and unsupported modes are not offered.
- Claude plan does not also set bypass. Claude Bypass sets `dangerously_skip_permissions` and does not attach the approval service.
- Cache: a file dated today skips every runner. A file dated yesterday calls the runner once per installed agent and rewrites `fetched_on`. A runner error is stored and a second startup the same day does not call that runner again. An agent that is not installed is absent from the file.
- Flat list versus “More models”: all-featured input has no secondary group; a mix does.
- Config migration: a v8 config plus a sample `profiles.json` produces the selection rules above, including a variant with no model field.
- Old execution-process read: `PLAN` and `APPROVALS` variant names map as specified when the profile file has no matching variant.
- Frontend: the new-task footer renders permission on the left and agent plus model on the right; choosing another agent drops a model id that is not in the new cache; a mode missing from that agent’s list is not in the menu; choosing an agent that does not offer the current permission selects Manual; `ready: false` shows the loading label and still allows model `None`.
- Frontend: the follow-up footer shows the agent as a label, with permission and model as controls.
- Creating a task persists `last_agent_selection`. A follow-up does not.
- A follow-up whose agent differs from the session is still rejected.

Then implement until those tests pass.

Then validate on a local build:

- `cargo test` for the new cache, mapping, and migration tests.
- `pnpm run generate-types`, then `pnpm run check` and the frontend tests.
- `pnpm run dev`. Confirm `model-cache.json` exists with today’s date after startup. Restart once the same day and confirm the listing commands are not run again.
- In the app: open a new task, see the footer, open the model menu and see only the cached list for that agent, switch agent and see the list change, switch permission, create the task. Open the follow-up, confirm it inherited those three, change the model, send. Open the Agents page and confirm there is no profile editor.

## Out of scope for the implementer to reopen

Do not add effort. Do not keep a hidden profile as a compatibility shim that the UI can still edit. Do not refetch models from the menu.
