# Software Agent Factory — Design

**Date:** 2026-07-26
**Status:** Approved (design), pending implementation plan
**Scope:** Full concept in one release (v1), desktop app only (Rust backend + React
frontend). Built on top of the existing project/worktree/dev-server app.

## Goal

Turn Kablan.dev into local **mission control for AI coding agents**: organize
parallel agent work as **Project → Feature → Task Force**, give each Task Force a
two-pane cockpit (agent chat + live assets), and surface what needs you with
Slack-style unread and a global attention inbox — while preserving today's
branch/worktree flow untouched.

## Concepts

- **Project** — a git repo (unchanged from today).
- **Feature** — a lightweight, Kablan-native *folder* grouping Task Forces. No
  branch or integration semantics of its own; its page rolls up the summary of
  its Task Forces (tickets, MRs, pipelines, tests, branches, activity).
- **Task Force** — the atomic unit: **one Kablan-owned Claude Code agent** running
  on a **freshly created** branch + worktree, with its Linear ticket, MR,
  pipeline, unit tests, and dev server. **Create-new only** — a Task Force always
  spins up a new branch/worktree; it never adopts an existing one.
- **Branches & worktrees** — today's flow, preserved as a separate section: every
  git branch/worktree (including ones created on the remote, in a terminal, or by
  another client) with the existing overview + drawer (checkout, pull, dev
  server, Open-in, GitLab tab). **No bridge** to Task Forces — the two are
  distinct, non-overlapping models.

## Navigation

Selecting a project reveals a **second (nested) sidebar** with a `‹ Projects` back
button and two sections:

1. **Features** — collapsible folders; each expands to its Task Forces. Each Task
   Force shows a status dot + unread pill; unread/attention bubbles up
   Task Force → Feature → Project. A "New feature" affordance.
2. **Branches & worktrees** — the current flow (main, remote branches, worktrees),
   each with its existing badges; selecting one opens today's overview/drawer.

A top-level **Inbox** item (above Projects, in the primary sidebar) is the global
attention surface across all projects.

## Backend (Rust)

New modules extend the existing Axum HTTP + WebSocket server. All agent/factory
endpoints are desktop-only (like the GitLab layer) and excluded from the
cross-backend parity suite.

### Agent supervisor

Each Task Force owns one long-lived Claude Code agent, spawned headless via the
Claude Agent SDK / CLI (`--output-format stream-json`, `--input-format
stream-json`) with the Task Force's worktree as cwd. The supervisor:

- owns the child process's stdin/stdout; parses the `stream-json` event protocol,
- relays agent events to the frontend over the existing WebSocket,
- forwards user messages and **tool-permission decisions** (approve / approve-for-
  session / deny) back to the agent,
- tracks lifecycle: spawn, running, exit (with code), and **resume-by-session-id**.

**Lifecycle across app restart:** agents **stop on app exit** (no orphaned
background processes); on relaunch, a Task Force with a known session id offers
**Resume** (Claude Code session resume) rather than auto-starting. Configurable
(see Settings).

**Concurrency:** a configurable **max concurrent running agents**; beyond it,
newly started Task Forces queue with a clear "queued" status.

### Factory store

Persists Features + Task Forces to the config dir (`~/.kablan/factory.json`,
keyed by project): feature name/order; per Task Force — name, base branch, branch,
worktree path, linear ticket, agent session id, created-at, last status, unread
cursor. Reconciled against real git worktrees on scan (a Task Force whose worktree
was deleted externally is flagged, not silently resurrected).

### Worktree lifecycle

Create Task Force → `git worktree add` a new branch off the chosen base → record in
the factory store → spawn the agent. Delete Task Force → stop the agent, optionally
remove the worktree/branch (confirmed).

### Attention engine

Derives per-Task-Force **status** from agent events:

- `working` — agent is producing output / running tools,
- `awaiting input` — assistant turn ended, no pending tool, waiting on the user,
- `needs approval` — a tool-permission request is open,
- `done` — agent exited cleanly / task complete,
- `failed` — non-zero exit or error,
- `idle` — no active agent.

Tracks **unread** (new agent output since the Task Force was last viewed), aggregates
counts up Feature → Project → global inbox, and pushes updates over WS. Optional
**desktop notifications** (Tauri) on configurable events.

### Endpoints (Rust only, desktop)

- `GET /api/projects/:name/factory` → features + task forces (from store, merged
  with live status).
- `POST /api/projects/:name/factory/features` `{ name }` → create feature.
- `POST .../features/:fid/taskforces` `{ name, baseBranch, linearTicket?,
  prompt }` → create worktree+branch, spawn agent → task force.
- `DELETE .../taskforces/:tid` `{ removeWorktree? }` → stop + clean up.
- `POST .../taskforces/:tid/message` `{ text }` → send to agent stdin.
- `POST .../taskforces/:tid/permission` `{ decision }` → answer a tool prompt.
- `POST .../taskforces/:tid/resume` / `.../stop` → lifecycle.
- `GET /api/inbox` → cross-project attention roll-up.
- WS: `taskforce.event` (streamed agent output), `taskforce.status`,
  `inbox.update`.

## Frontend (React)

All Agent-Factory UI is gated on `isTauri`. Reuses existing components where the
asset rail overlaps the main app.

- **Nested sidebar** — Features section (folder tree + task forces with status/
  unread) and Branches & worktrees section (existing entry points).
- **Feature page** — metric strip (task forces / open MRs / pipelines / tests) +
  task-force list + tickets/MRs/branches + recent activity, all rolled up from the
  feature's Task Forces.
- **Task Force cockpit** — a two-pane split:
  - **Chat pane** — streamed agent transcript (messages, tool calls, **inline
    permission prompts** with Approve / Approve-for-session / Deny), plus a
    composer to message the agent.
  - **Assets rail** — branch/worktree, Linear ticket (`LinearLink`), merge request
    + pipeline + unit tests (`GitlabSection`), and dev-server start/stop + URL
    (reusing the main-app server controls), scoped to this worktree.
- **Create Task Force dialog** — name, base branch, optional Linear ticket, initial
  prompt → creates + launches.
- **Global inbox** — cross-project triage list (status dot, path, last message,
  time, jump-in).

## Settings (everything configurable)

New **Settings → Agent factory** card(s), stored in `~/.kablan/config.json`
(extending the existing config module):

- **Agent binary / command** (path to `claude`) and **default model**.
- **Permission mode** — how tool prompts default (always ask / auto-approve safe
  tools / etc.).
- **Default base branch** for new Task Forces.
- **Worktree root** and **branch-naming pattern** (e.g. `feat/{feature}-{task}`).
- **Max concurrent agents.**
- **On app exit** — stop agents (default) vs keep running.
- **Auto-resume** on relaunch — on/off.
- **Notifications** — enable desktop notifications and select which events fire
  them (needs-approval, awaiting-input, failed, done).

All factory behavior reads from config; nothing is hard-coded.

## Error handling

- Agent fails to spawn (bad binary/path) → surfaced in the cockpit + Settings hint,
  never a silent no-op.
- Agent process crash / non-zero exit → `failed` status + inbox entry; log tail
  viewable.
- Worktree creation failure (dirty base, name clash) → clear error, no partial
  state (roll back the store entry).
- Store ↔ git drift → reconcile on scan; flag orphaned task forces.
- No toast spam on background status changes; toasts only on explicit user actions.

## Testing (TDD)

Development is **test-first** for every unit.

- **Rust (unit, test-first):** factory store (CRUD + persistence + reconcile);
  worktree lifecycle; the **agent event → status mapping** and unread cursor,
  driven by a **mock `stream-json` agent** (a fixture process/stream, no real
  Claude Code, no network); config parsing/defaults for the new keys.
- **Frontend (TDD, new harness):** the app has no frontend tests today, so add
  **Vitest + React Testing Library** as a prerequisite. Drive components
  test-first — the cockpit (rendering streamed events, permission prompt →
  decision), sidebar unread/status aggregation, create dialog validation, and the
  inbox — using a **mock WebSocket / event stream**. Streaming-heavy end-to-end
  behavior may add a small Playwright pass if unit coverage is insufficient.
- **Parity:** the existing 75-test cross-backend suite stays green; factory/agent
  endpoints are desktop-only and excluded, as with GitLab.

## Security

- Agents run locally in their worktree; the supervisor is the only channel to
  stdin. Tool-permission prompts are surfaced to the user, honoring the configured
  permission mode — Kablan never auto-approves beyond that setting.
- No secrets in the factory store. GitLab token handling is unchanged (OS
  keychain). Agent output is local only.

## Implementation sequencing

Designed as one product; implemented as ordered, independently testable
subsystems so each lands green:

1. **Config + Settings** — new keys, Settings → Agent factory card (TDD).
2. **Factory store + worktree lifecycle** — data model, create/delete, reconcile.
3. **Agent supervisor** — spawn/own/stream/input/permission/resume, over a mock
   agent first, then real Claude Code.
4. **Cockpit UI** — nested sidebar, feature page, 2-pane cockpit, create dialog.
5. **Attention engine + inbox + notifications** — status/unread aggregation, global
   inbox, desktop notifications.

## Open questions (confirm during planning)

- Exact `stream-json` event schema mapping (verify against the current Claude Code
  Agent SDK before building the supervisor).
- Whether the assets rail is stacked (as mocked) or tabbed when space is tight.
- Multi-select / bulk actions in the inbox (defer unless needed).
