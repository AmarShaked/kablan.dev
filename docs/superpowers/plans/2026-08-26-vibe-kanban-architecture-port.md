# Vibe-Kanban Architecture Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Kablan's in-memory, persistent-process agent subsystem with vibe-kanban's design — a SQLite-backed store of the source of truth, discrete per-turn execution processes, a persisted follow-up queue + composer drafts, and SSE streaming — everything except its multi-executor abstraction (Kablan stays Claude-only).

**Architecture:** Each agent *turn* becomes a short-lived `claude` execution: the message is written to stdin, stdin is **closed**, `claude` runs the one turn and exits (vs today's one long-lived process per branch with stdin held open). A new `store` module (SQLite via `sqlx`) holds sessions, execution-processes, their normalized log entries, the follow-up queue, and composer drafts — so status/history survive restarts and can never drift in memory. The frontend consumes **SSE** streams (one per branch cockpit + a global event stream) instead of the single global WebSocket.

**Tech Stack:** Rust (axum, tokio, `sqlx` + SQLite, `nix`), React + TypeScript + Vite, TanStack Query. Reuses the existing `claude` CLI stream-json contract.

**Spec:** this document (design + plan combined; see "Target Architecture" below).

## Global Constraints

- Kablan stays **Claude-only** — do NOT port vibe-kanban's multi-executor abstraction (the excluded item).
- The app must **build and pass all tests at the end of every phase** — no phase may leave `main` broken. Each phase is independently shippable.
- SQLite DB lives at `config::config_dir().join("kablan.db")`; migrations run on startup. `KABLAN_CONFIG_DIR` still overrides the dir (tests rely on it).
- Preserve existing user-visible behavior except where a phase explicitly changes it; the cockpit chat must keep working throughout.
- Rust unit tests run single-threaded where they touch `KABLAN_CONFIG_DIR` (`--test-threads=1`), matching the existing pattern.
- The Node reference server (`server/`) does not implement agents; parity tests must stay green (don't change tested endpoints' shapes in ways the Node server can't match — agent/session/SSE endpoints are Rust-only and untested by parity).
- Keep the branch as the primary unit (Kablan is branch-centric); map vibe-kanban's task/attempt onto Kablan's branch rather than introducing a Kanban board.

---

## Target Architecture

### Data-model mapping (vibe-kanban → Kablan)

| vibe-kanban | Kablan port |
|---|---|
| `task` → `task_attempt` | the **branch** (identified by `{project}::branch:{branch}`) |
| `execution_process` | one row per **turn** (initial message or follow-up), with status + exit code + started/ended timestamps |
| `executor_session` | the Claude `session_id` for the branch (moves out of `factory.json` into the DB) |
| normalized log entries | the stream-json events per execution (replacing `chat_history` JSONL) |
| `draft_follow_up` (scratch) | composer **draft** per branch |
| follow-up queue | queued turns per branch, run when the current execution finishes |

### SQLite schema (Phase 1 creates the tables it needs; later phases add columns)

- `sessions(branch_key TEXT PRIMARY KEY, session_id TEXT, status TEXT, worktree_path TEXT, updated_at INTEGER)`
- `execution_processes(id TEXT PRIMARY KEY, branch_key TEXT, run_reason TEXT, status TEXT, pid INTEGER, exit_code INTEGER, started_at INTEGER, ended_at INTEGER)`
- `execution_logs(execution_id TEXT, seq INTEGER, event JSON, PRIMARY KEY(execution_id, seq))`
- `follow_up_queue(id TEXT PRIMARY KEY, branch_key TEXT, text TEXT, images JSON, created_at INTEGER)`
- `drafts(branch_key TEXT PRIMARY KEY, text TEXT, images JSON, updated_at INTEGER)`

### Migration strategy (how the app stays working)

Phases are ordered so value lands early and risk stays contained:

1. **Phase 1 — SQLite foundation + authoritative status.** Add the `store` module + migrations; mirror agent status/session into the DB; on startup, reconcile the registry from the DB and prune dead. Kills the status-drift class *without* touching the process model or transport. (Keeps WS + persistent process.)
2. **Phase 2 — Persisted drafts + server-side follow-up queue.** Composer draft and the queue move into the DB (survive reload/restart). Frontend reads/writes drafts via new endpoints; the queue drains server-side.
3. **Phase 3 — Per-turn execution model.** Sending a turn spawns a `claude` that gets one message on stdin, stdin closed, runs, exits; `execution_processes` rows track each turn; follow-ups run when the current finishes. Removes the persistent-idle-process model (and, with it, the whole "idle agents trip the limit" class).
4. **Phase 4 — SSE transport.** Replace the global WebSocket with SSE streams (global events + per-branch log stream). Frontend switches its stream client.
5. **Phase 5 — Frontend consolidation.** Status/history rendered from executions; remove the now-dead WS/in-memory paths; final cleanup.

Each phase has its own detailed task list, written when the phase begins (its interfaces depend on the prior phase). Phase 1 is detailed below.

---

## Phase 1 — SQLite foundation + authoritative status

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `sqlx` with `runtime-tokio`, `sqlite`, `json`, `macros` offline-free; and `uuid`)
- Create: `src-tauri/src/store.rs` (the SQLite store: pool, migrations, session/status accessors)
- Create: `src-tauri/migrations/0001_init.sql` (the tables above)
- Modify: `src-tauri/src/lib.rs` (build the pool at startup, run migrations, hold it in `AppState`, reconcile registry↔DB, wire status mirroring)
- Modify: `src-tauri/src/agents.rs` (emit a hook when status/session changes so the store can mirror it — mirror the existing `chat_history::append_event` pattern)

**Interfaces:**
- Produces: `store::Store` with
  - `Store::open(path: &Path) -> Result<Store, String>` (creates pool, runs migrations)
  - `Store::upsert_session(&self, branch_key: &str, session_id: Option<&str>, status: &str, worktree_path: Option<&str>)`
  - `Store::get_session(&self, branch_key: &str) -> Option<SessionRow>` where `SessionRow { branch_key: String, session_id: Option<String>, status: String, worktree_path: Option<String> }`
  - `Store::all_sessions(&self) -> Vec<SessionRow>`
- Consumes: nothing from earlier phases (this is the first).

> Detailed bite-sized steps (write-failing-test → run → implement → run → commit) are authored at execution start for each task below, following the repo's existing test conventions (`#[cfg(test)]` modules, `KABLAN_CONFIG_DIR` temp dirs, `--test-threads=1`). Task boundaries:

### Task 1.1: Add `sqlx`/SQLite deps and a `store` module that opens a pool + runs migrations
- Deliverable: `store::Store::open` creates the DB file, applies `0001_init.sql`, and a unit test (temp dir via `KABLAN_CONFIG_DIR`) asserts the tables exist.

### Task 1.2: Session/status accessors on `Store`
- Deliverable: `upsert_session`, `get_session`, `all_sessions` with a round-trip unit test.

### Task 1.3: Hold the pool in `AppState`; run migrations at startup
- Deliverable: `serve_on_with` opens the store; a startup smoke test confirms the DB is created under the config dir.

### Task 1.4: Mirror agent status/session into the store
- Deliverable: when `agents` captures a session id or a status change, the store row is updated (reuse the reader-thread hook that already calls `persist_branch_session_id`). Unit test drives a mock agent and asserts the DB row tracks its status.

### Task 1.5: Reconcile registry ↔ DB on startup + make `running_count`/status authoritative
- Deliverable: on startup, sessions marked "working"/"idle" whose process is gone are reconciled to a terminal status; the cockpit's status derivation prefers the DB row. Unit test: a stale "working" row reconciles to terminal on open.

### Task 1.6: Point session-id persistence + backfill at the store (retire that slice of `factory.json`)
- Deliverable: `persist_branch_session_id` and `get_branch_agent` read/write session id + history status from the store; `factory.json` keeps only worktree bookkeeping. Migration reads any existing `factory.json` session ids once. Tests updated.

---

## Later phases (scoped; detailed at execution time)

- **Phase 2:** `drafts` + `follow_up_queue` tables already exist; add endpoints `GET/PUT /factory/draft` and `POST/DELETE /factory/queue`; frontend persists the composer draft and renders the server queue; server drains the queue on idle. Removes the client-only queue.
- **Phase 3:** introduce `execution_processes`; `agents.start`/`send` become "spawn one turn, write message, close stdin, stream to `execution_logs`, exit"; a supervisor runs the next queued turn when one finishes; `--resume` threads the session between turns. Retire the persistent-idle process + the reap/prune logic it required.
- **Phase 4:** add `GET /events` (global SSE) and `GET /factory/agent/stream` (per-branch SSE) fed from the store's change stream; frontend replaces `useAgentStream`'s WebSocket with an SSE client; remove `ws_handler`.
- **Phase 5:** render transcript/status from `execution_processes` + `execution_logs`; delete dead in-memory/WS code; docs + CHANGELOG.

---

## Self-Review notes

- **Spec coverage:** every adopted vibe-kanban behavior (per-turn executions → Phase 3; SQLite authoritative → Phase 1; SSE → Phase 4; server queue + drafts → Phase 2) maps to a phase; the excluded multi-executor is called out in Global Constraints.
- **Working-at-every-phase:** Phases 1–2 are additive (DB mirrors/augments existing behavior); the disruptive swaps (process model, transport) are Phases 3–4, each self-contained and shippable.
- **Type consistency:** `branch_key` is the single identifier across all tables and matches `branch_agent_key` (`{project}::branch:{branch}`).
