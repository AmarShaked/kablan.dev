-- Kablan's agent store. The source of truth for agent state: previously this lived in an
-- in-memory registry (which drifted — a stale "working" survived reconnects) plus factory.json
-- and JSONL transcripts. Keyed throughout by `branch_key` = "{project}::branch:{branch}",
-- matching `branch_agent_key` in lib.rs.

-- One row per branch that has ever hosted an agent: its Claude session (for --resume) and its
-- last known status.
CREATE TABLE IF NOT EXISTS sessions (
    branch_key    TEXT PRIMARY KEY,
    session_id    TEXT,
    status        TEXT NOT NULL DEFAULT 'idle',
    worktree_path TEXT,
    updated_at    INTEGER NOT NULL DEFAULT 0
);

-- One row per agent TURN (an initial message or a follow-up). Phase 3 spawns a process per turn;
-- Phase 1 already records them so status/history are durable.
CREATE TABLE IF NOT EXISTS execution_processes (
    id         TEXT PRIMARY KEY,
    branch_key TEXT NOT NULL,
    run_reason TEXT NOT NULL DEFAULT 'initial',
    status     TEXT NOT NULL DEFAULT 'running',
    pid        INTEGER,
    exit_code  INTEGER,
    started_at INTEGER NOT NULL DEFAULT 0,
    ended_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_execution_processes_branch ON execution_processes (branch_key, started_at);

-- The stream-json events of an execution, in arrival order (replaces the JSONL transcripts).
CREATE TABLE IF NOT EXISTS execution_logs (
    execution_id TEXT NOT NULL,
    seq          INTEGER NOT NULL,
    event        TEXT NOT NULL,
    PRIMARY KEY (execution_id, seq)
);

-- Messages the user submitted while a turn was running, drained when it finishes. Server-side so
-- a queued message survives a reload (it used to live only in React state).
CREATE TABLE IF NOT EXISTS follow_up_queue (
    id         TEXT PRIMARY KEY,
    branch_key TEXT NOT NULL,
    text       TEXT NOT NULL DEFAULT '',
    images     TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_branch ON follow_up_queue (branch_key, created_at);

-- The composer's unsent text/attachments per branch, so a draft survives reload and restart.
CREATE TABLE IF NOT EXISTS drafts (
    branch_key TEXT PRIMARY KEY,
    text       TEXT NOT NULL DEFAULT '',
    images     TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL DEFAULT 0
);
