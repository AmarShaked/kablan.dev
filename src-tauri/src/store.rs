//! SQLite-backed agent store — the source of truth for agent state.
//!
//! Kablan used to keep agent status in an in-memory registry only. That drifts: a status could
//! outlive the process it described (a stale "working" survived a dropped WebSocket, showing a
//! runaway timer and a Stop button that did nothing), and everything was lost on restart. This
//! module holds that state durably instead, keyed by `branch_key` ("{project}::branch:{branch}",
//! see `branch_agent_key`).
//!
//! Phase 1 uses the `sessions` table (session id for `--resume`, plus last known status); the
//! remaining tables in `migrations/0001_init.sql` are created up front for the later phases
//! (executions + logs, the follow-up queue, and composer drafts).

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::path::Path;
use std::str::FromStr;
use std::sync::OnceLock;

/// Process-wide handle so the agent supervisor's *synchronous* reader threads can mirror status
/// and session ids into the store. Those threads have no `AppState` and no async context, so
/// `mirror_status` below bridges to the runtime. Set once at startup by `install_global`.
static GLOBAL: OnceLock<(Store, tokio::runtime::Handle)> = OnceLock::new();

/// Publish the store for `mirror_status`. Call from async startup, once. A second call is
/// ignored (returns false) rather than replacing a live handle mid-run.
pub fn install_global(store: Store) -> bool {
    match tokio::runtime::Handle::try_current() {
        Ok(handle) => GLOBAL.set((store, handle)).is_ok(),
        Err(_) => false,
    }
}

/// The globally-installed store plus the runtime to spawn on, for sync callers that need to run
/// their own async work (e.g. draining the follow-up queue). `None` before startup installs one.
pub fn global() -> Option<(Store, tokio::runtime::Handle)> {
    GLOBAL.get().cloned()
}

/// Record a newly-captured Claude session id from sync code (the supervisor's reader thread learns
/// it from the stream's `init` event). Separate from `mirror_status` because the id often arrives
/// on an event that doesn't change status, so the status hook alone would miss it — and missing it
/// means the next launch can't `--resume` and the conversation silently starts over.
pub fn mirror_session_id(branch_key: &str, session_id: &str) {
    let Some((store, handle)) = GLOBAL.get() else { return };
    let (store, key, sid) = (store.clone(), branch_key.to_string(), session_id.to_string());
    handle.spawn(async move {
        let _ = store.set_session_id(&key, &sid).await;
    });
}

/// Mirror a branch's status (and session id, when newly learned) into the store from sync code.
/// Fire-and-forget: the write is spawned on the runtime so an agent's reader thread never blocks
/// on disk, and a storage hiccup can never stall or kill the stream.
pub fn mirror_status(branch_key: &str, session_id: Option<&str>, status: &str) {
    let Some((store, handle)) = GLOBAL.get() else { return };
    let (store, key, sid, status) = (
        store.clone(),
        branch_key.to_string(),
        session_id.map(str::to_string),
        status.to_string(),
    );
    handle.spawn(async move {
        let _ = store.upsert_session(&key, sid.as_deref(), &status, None).await;
    });
}

/// One branch's agent state as stored.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionRow {
    pub branch_key: String,
    pub session_id: Option<String>,
    pub status: String,
    pub worktree_path: Option<String>,
}

/// An attachment carried by a draft or a queued message. Same `{mediaType, data}` shape the send
/// endpoint already takes (raw base64, no data-URL prefix), so a drained message can go straight
/// to the agent; the frontend rebuilds a `data:` URL from these two fields for its thumbnails.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredImage {
    pub media_type: String,
    pub data: String,
}

/// One agent turn: a `claude` process that took a single message and ran to completion.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionRow {
    pub id: String,
    pub run_reason: String,
    pub status: String,
    pub exit_code: Option<i32>,
}

/// One message waiting in a branch's follow-up queue.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct QueuedMessage {
    pub id: String,
    pub text: String,
    pub images: Vec<StoredImage>,
}

#[derive(Clone)]
pub struct Store {
    pool: SqlitePool,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

impl Store {
    /// Open (creating if needed) the database at `path` and apply the migrations. The parent
    /// directory is created first — on a fresh install the config dir may not exist yet.
    pub async fn open(path: &Path) -> Result<Store, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("store: create dir failed: {e}"))?;
        }
        let opts = SqliteConnectOptions::from_str(&format!("sqlite://{}", path.to_string_lossy()))
            .map_err(|e| format!("store: bad path: {e}"))?
            .create_if_missing(true)
            // WAL keeps readers from blocking the writer; the UI polls while turns stream.
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(opts)
            .await
            .map_err(|e| format!("store: connect failed: {e}"))?;
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(|e| format!("store: migrate failed: {e}"))?;
        Ok(Store { pool })
    }

    /// Record (or update) a branch's agent state. `session_id`/`worktree_path` are only written
    /// when `Some`, so a status-only update can't erase a session id we already know — the id is
    /// what makes a conversation resumable after a restart.
    pub async fn upsert_session(
        &self,
        branch_key: &str,
        session_id: Option<&str>,
        status: &str,
        worktree_path: Option<&str>,
    ) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO sessions (branch_key, session_id, status, worktree_path, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(branch_key) DO UPDATE SET
               session_id    = COALESCE(excluded.session_id, sessions.session_id),
               status        = excluded.status,
               worktree_path = COALESCE(excluded.worktree_path, sessions.worktree_path),
               updated_at    = excluded.updated_at",
        )
        .bind(branch_key)
        .bind(session_id)
        .bind(status)
        .bind(worktree_path)
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map_err(|e| format!("store: upsert_session failed: {e}"))?;
        Ok(())
    }

    /// Record the branch's Claude session id, keeping whatever status the row already has. Only
    /// the FIRST id is kept: once a conversation has an id, later ids belong to restarts of the
    /// same conversation and overwriting would lose the resumable thread.
    pub async fn set_session_id(&self, branch_key: &str, session_id: &str) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO sessions (branch_key, session_id, status, updated_at)
             VALUES (?1, ?2, 'idle', ?3)
             ON CONFLICT(branch_key) DO UPDATE SET
               session_id = COALESCE(sessions.session_id, excluded.session_id),
               updated_at = excluded.updated_at",
        )
        .bind(branch_key)
        .bind(session_id)
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map_err(|e| format!("store: set_session_id failed: {e}"))?;
        Ok(())
    }

    /// Forget the branch's session id so the next launch starts a brand-new conversation — the
    /// chat RESET path. The row itself stays (status/worktree remain meaningful).
    pub async fn clear_session_id(&self, branch_key: &str) -> Result<(), String> {
        sqlx::query("UPDATE sessions SET session_id = NULL, updated_at = ?2 WHERE branch_key = ?1")
            .bind(branch_key)
            .bind(now_ms())
            .execute(&self.pool)
            .await
            .map_err(|e| format!("store: clear_session_id failed: {e}"))?;
        Ok(())
    }

    pub async fn get_session(&self, branch_key: &str) -> Option<SessionRow> {
        let row = sqlx::query(
            "SELECT branch_key, session_id, status, worktree_path FROM sessions WHERE branch_key = ?1",
        )
        .bind(branch_key)
        .fetch_optional(&self.pool)
        .await
        .ok()
        .flatten()?;
        Some(SessionRow {
            branch_key: row.get("branch_key"),
            session_id: row.get("session_id"),
            status: row.get("status"),
            worktree_path: row.get("worktree_path"),
        })
    }

    pub async fn all_sessions(&self) -> Vec<SessionRow> {
        let rows = sqlx::query("SELECT branch_key, session_id, status, worktree_path FROM sessions")
            .fetch_all(&self.pool)
            .await
            .unwrap_or_default();
        rows.into_iter()
            .map(|row| SessionRow {
                branch_key: row.get("branch_key"),
                session_id: row.get("session_id"),
                status: row.get("status"),
                worktree_path: row.get("worktree_path"),
            })
            .collect()
    }

    // --- Execution processes ----------------------------------------------------------------
    // One row per agent TURN. A turn is a `claude` process that receives one message, streams its
    // work, and exits — so "what happened, and did it finish" is durable rather than inferred from
    // a live process that may no longer exist.

    /// Open a row for a turn that is starting. `run_reason` is "initial" for the first turn of a
    /// conversation and "followUp" afterwards. Returns the new execution id.
    pub async fn begin_execution(
        &self,
        branch_key: &str,
        run_reason: &str,
        pid: Option<i32>,
    ) -> Result<String, String> {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO execution_processes (id, branch_key, run_reason, status, pid, started_at)
             VALUES (?1, ?2, ?3, 'running', ?4, ?5)",
        )
        .bind(&id)
        .bind(branch_key)
        .bind(run_reason)
        .bind(pid)
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map_err(|e| format!("store: begin_execution failed: {e}"))?;
        Ok(id)
    }

    /// Close a turn's row once its process exits. `exit_code` of `Some(0)` is a completed turn;
    /// anything else (including a signal, which reports `None`) is a failure.
    pub async fn finish_execution(&self, id: &str, exit_code: Option<i32>) -> Result<(), String> {
        let status = if exit_code == Some(0) { "completed" } else { "failed" };
        sqlx::query(
            "UPDATE execution_processes SET status = ?2, exit_code = ?3, ended_at = ?4 WHERE id = ?1",
        )
        .bind(id)
        .bind(status)
        .bind(exit_code)
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map_err(|e| format!("store: finish_execution failed: {e}"))?;
        Ok(())
    }

    /// A branch's turns, newest first.
    pub async fn list_executions(&self, branch_key: &str) -> Vec<ExecutionRow> {
        sqlx::query(
            "SELECT id, run_reason, status, exit_code FROM execution_processes
             WHERE branch_key = ?1 ORDER BY rowid DESC",
        )
        .bind(branch_key)
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|row| ExecutionRow {
            id: row.get("id"),
            run_reason: row.get("run_reason"),
            status: row.get("status"),
            exit_code: row.get("exit_code"),
        })
        .collect()
    }

    /// Close out turns still marked running at startup — their processes died with the last run.
    pub async fn reconcile_stale_executions(&self) -> u64 {
        sqlx::query(
            "UPDATE execution_processes SET status = 'failed', ended_at = ?1 WHERE status = 'running'",
        )
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map(|r| r.rows_affected())
        .unwrap_or(0)
    }

    // --- Composer drafts -------------------------------------------------------------------
    // The unsent contents of a branch's composer. Kept server-side so a half-written message
    // survives a reload, a branch switch, and an app restart instead of living only in React
    // state. `images` is a JSON array of data URLs.

    /// Store (or clear) a branch's draft. An empty draft with no images deletes the row rather
    /// than leaving an empty one behind.
    pub async fn set_draft(&self, branch_key: &str, text: &str, images: &[StoredImage]) -> Result<(), String> {
        if text.is_empty() && images.is_empty() {
            sqlx::query("DELETE FROM drafts WHERE branch_key = ?1")
                .bind(branch_key)
                .execute(&self.pool)
                .await
                .map_err(|e| format!("store: clear draft failed: {e}"))?;
            return Ok(());
        }
        let images_json = serde_json::to_string(images).unwrap_or_else(|_| "[]".to_string());
        sqlx::query(
            "INSERT INTO drafts (branch_key, text, images, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(branch_key) DO UPDATE SET
               text = excluded.text, images = excluded.images, updated_at = excluded.updated_at",
        )
        .bind(branch_key)
        .bind(text)
        .bind(images_json)
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map_err(|e| format!("store: set_draft failed: {e}"))?;
        Ok(())
    }

    /// The branch's draft as `(text, images)`, or `("", [])` when there is none.
    pub async fn get_draft(&self, branch_key: &str) -> (String, Vec<StoredImage>) {
        let Some(row) = sqlx::query("SELECT text, images FROM drafts WHERE branch_key = ?1")
            .bind(branch_key)
            .fetch_optional(&self.pool)
            .await
            .ok()
            .flatten()
        else {
            return (String::new(), Vec::new());
        };
        let text: String = row.get("text");
        let images: String = row.get("images");
        (text, serde_json::from_str(&images).unwrap_or_default())
    }

    // --- Follow-up queue -------------------------------------------------------------------
    // Messages submitted while a turn was still running. Server-side so a queued message survives
    // a reload; drained in FIFO order when the agent next goes idle.

    /// Append a message to the branch's queue and return its id.
    pub async fn enqueue_follow_up(
        &self,
        branch_key: &str,
        text: &str,
        images: &[StoredImage],
    ) -> Result<String, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let images_json = serde_json::to_string(images).unwrap_or_else(|_| "[]".to_string());
        sqlx::query(
            "INSERT INTO follow_up_queue (id, branch_key, text, images, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(&id)
        .bind(branch_key)
        .bind(text)
        .bind(images_json)
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map_err(|e| format!("store: enqueue failed: {e}"))?;
        Ok(id)
    }

    /// The branch's queued messages, oldest first.
    pub async fn list_queue(&self, branch_key: &str) -> Vec<QueuedMessage> {
        sqlx::query(
            // Order by rowid: SQLite assigns it in insertion order, so this is true FIFO.
            // created_at is only millisecond-resolution, so two messages queued in the same
            // millisecond tied and fell back to the random uuid — delivering them out of order.
            "SELECT id, text, images FROM follow_up_queue WHERE branch_key = ?1 ORDER BY rowid",
        )
        .bind(branch_key)
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|row| {
            let images: String = row.get("images");
            QueuedMessage {
                id: row.get("id"),
                text: row.get("text"),
                images: serde_json::from_str(&images).unwrap_or_default(),
            }
        })
        .collect()
    }

    /// Remove one queued message (the user cancelled it, or it has been sent). Returns whether a
    /// row was actually removed — the caller uses that to avoid double-sending a message another
    /// client already drained.
    pub async fn remove_queued(&self, id: &str) -> bool {
        sqlx::query("DELETE FROM follow_up_queue WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map(|r| r.rows_affected() > 0)
            .unwrap_or(false)
    }

    /// Claim the branch's oldest queued message, removing it in the same step. The delete is what
    /// makes the claim exclusive: if two drains race (two windows, or a status flap), only the one
    /// whose delete affected a row gets the message, so it is never sent twice.
    pub async fn take_next_queued(&self, branch_key: &str) -> Option<QueuedMessage> {
        loop {
            let next = self.list_queue(branch_key).await.into_iter().next()?;
            if self.remove_queued(&next.id).await {
                return Some(next);
            }
            // Lost the race for that one — try the next still in the queue.
        }
    }

    /// Reconcile statuses left behind by a crash or a hard quit: any branch still recorded as
    /// live ("idle"/"working"/"awaitingInput") cannot be, because no agent survives a restart.
    /// Returns the keys that were corrected. Without this the UI would reopen showing agents that
    /// stopped existing — the durable version of the drift this store exists to prevent.
    pub async fn reconcile_stale_statuses(&self) -> Vec<String> {
        let keys: Vec<String> = sqlx::query(
            "SELECT branch_key FROM sessions WHERE status IN ('idle','working','awaitingInput')",
        )
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|r| r.get::<String, _>("branch_key"))
        .collect();
        if keys.is_empty() {
            return keys;
        }
        let _ = sqlx::query(
            "UPDATE sessions SET status = 'done', updated_at = ?1
             WHERE status IN ('idle','working','awaitingInput')",
        )
        .bind(now_ms())
        .execute(&self.pool)
        .await;
        keys
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Each test gets its own database file, so they don't share state.
    async fn open_temp(tag: &str) -> (Store, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "kablan-store-{tag}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("kablan.db");
        let store = Store::open(&path).await.expect("open store");
        (store, dir)
    }

    #[tokio::test]
    async fn open_creates_the_db_and_applies_migrations() {
        let (store, dir) = open_temp("open").await;
        assert!(dir.join("kablan.db").exists(), "db file should be created");
        // Every migrated table should be queryable.
        for table in ["sessions", "execution_processes", "execution_logs", "follow_up_queue", "drafts"] {
            let ok = sqlx::query(&format!("SELECT COUNT(*) FROM {table}"))
                .fetch_one(&store.pool)
                .await
                .is_ok();
            assert!(ok, "table {table} should exist");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn upsert_and_read_back_a_session() {
        let (store, dir) = open_temp("roundtrip").await;
        assert!(store.get_session("p::branch:feat/x").await.is_none());

        store
            .upsert_session("p::branch:feat/x", Some("sid-1"), "working", Some("/wt/x"))
            .await
            .unwrap();
        let got = store.get_session("p::branch:feat/x").await.unwrap();
        assert_eq!(got.session_id.as_deref(), Some("sid-1"));
        assert_eq!(got.status, "working");
        assert_eq!(got.worktree_path.as_deref(), Some("/wt/x"));

        // A status-only update must not erase the session id — that id is what makes the
        // conversation resumable, so losing it would silently start a fresh chat.
        store.upsert_session("p::branch:feat/x", None, "idle", None).await.unwrap();
        let got = store.get_session("p::branch:feat/x").await.unwrap();
        assert_eq!(got.session_id.as_deref(), Some("sid-1"));
        assert_eq!(got.status, "idle");
        assert_eq!(got.worktree_path.as_deref(), Some("/wt/x"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn set_session_id_keeps_the_first_id_and_preserves_status() {
        let (store, dir) = open_temp("setsid").await;
        store.upsert_session("p::branch:x", None, "working", None).await.unwrap();
        store.set_session_id("p::branch:x", "sid-1").await.unwrap();
        let got = store.get_session("p::branch:x").await.unwrap();
        assert_eq!(got.session_id.as_deref(), Some("sid-1"));
        assert_eq!(got.status, "working", "recording an id must not disturb status");

        // A later id belongs to a restart of the SAME conversation; overwriting would lose the
        // resumable thread, so the first id wins.
        store.set_session_id("p::branch:x", "sid-2").await.unwrap();
        assert_eq!(
            store.get_session("p::branch:x").await.unwrap().session_id.as_deref(),
            Some("sid-1")
        );

        // Recording an id for a branch with no row yet creates one.
        store.set_session_id("p::branch:new", "sid-n").await.unwrap();
        assert_eq!(
            store.get_session("p::branch:new").await.unwrap().session_id.as_deref(),
            Some("sid-n")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn clear_session_id_forgets_only_the_id() {
        let (store, dir) = open_temp("clearsid").await;
        store
            .upsert_session("p::branch:r", Some("sid-1"), "idle", Some("/wt/r"))
            .await
            .unwrap();
        store.clear_session_id("p::branch:r").await.unwrap();
        let got = store.get_session("p::branch:r").await.unwrap();
        assert_eq!(got.session_id, None, "RESET must forget the conversation");
        assert_eq!(got.worktree_path.as_deref(), Some("/wt/r"), "row otherwise intact");
        // And a fresh id can then be recorded (the next conversation).
        store.set_session_id("p::branch:r", "sid-2").await.unwrap();
        assert_eq!(
            store.get_session("p::branch:r").await.unwrap().session_id.as_deref(),
            Some("sid-2")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn all_sessions_lists_every_branch() {
        let (store, dir) = open_temp("all").await;
        store.upsert_session("p::branch:a", Some("s1"), "idle", None).await.unwrap();
        store.upsert_session("p::branch:b", Some("s2"), "working", None).await.unwrap();
        let mut keys: Vec<String> = store.all_sessions().await.into_iter().map(|s| s.branch_key).collect();
        keys.sort();
        assert_eq!(keys, vec!["p::branch:a", "p::branch:b"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The supervisor mirrors through `install_global`/`mirror_status`, which are process-wide.
    /// This drives a real agent so the whole path is covered: reader thread -> emit_status ->
    /// mirror_status -> DB row. It runs alone (the global can only be installed once per process),
    /// so it also asserts the fallbacks around that.
    #[tokio::test]
    async fn agent_status_is_mirrored_into_the_store() {
        let (store, dir) = open_temp("mirror").await;
        // Before a global is installed, mirroring is a silent no-op rather than a panic.
        super::mirror_status("p::branch:none", Some("x"), "working");
        assert!(store.get_session("p::branch:none").await.is_none());

        if !super::install_global(store.clone()) {
            // Another test in this process already installed one; the rest can't be asserted.
            let _ = std::fs::remove_dir_all(&dir);
            return;
        }
        super::mirror_status("p::branch:m", Some("sid-9"), "working");
        // The write is spawned, so poll briefly for it.
        let mut got = None;
        for _ in 0..100 {
            if let Some(row) = store.get_session("p::branch:m").await {
                got = Some(row);
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        let got = got.expect("status should be mirrored into the store");
        assert_eq!(got.status, "working");
        assert_eq!(got.session_id.as_deref(), Some("sid-9"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn executions_record_each_turn_and_its_outcome() {
        let (store, dir) = open_temp("exec").await;
        let first = store.begin_execution("p::branch:e", "initial", Some(42)).await.unwrap();
        let second = store.begin_execution("p::branch:e", "followUp", Some(43)).await.unwrap();

        // Newest first, both still running.
        let rows = store.list_executions("p::branch:e").await;
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|r| r.status == "running"));

        store.finish_execution(&first, Some(0)).await.unwrap();
        store.finish_execution(&second, Some(1)).await.unwrap();
        let rows = store.list_executions("p::branch:e").await;
        let by_id = |id: &str| rows.iter().find(|r| r.id == id).unwrap().clone();
        assert_eq!(by_id(&first).status, "completed");
        assert_eq!(by_id(&second).status, "failed", "a non-zero exit is a failed turn");
        assert_eq!(by_id(&second).exit_code, Some(1));
        // A killed process reports no code at all — still a failure, not a success.
        let third = store.begin_execution("p::branch:e", "followUp", None).await.unwrap();
        store.finish_execution(&third, None).await.unwrap();
        assert_eq!(by_id_in(&store.list_executions("p::branch:e").await, &third).status, "failed");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn reconcile_closes_turns_left_running_by_a_previous_run() {
        let (store, dir) = open_temp("execrec").await;
        store.begin_execution("p::branch:x", "initial", Some(7)).await.unwrap();
        let done = store.begin_execution("p::branch:x", "followUp", Some(8)).await.unwrap();
        store.finish_execution(&done, Some(0)).await.unwrap();

        assert_eq!(store.reconcile_stale_executions().await, 1, "only the still-running one");
        let rows = store.list_executions("p::branch:x").await;
        assert!(rows.iter().all(|r| r.status != "running"));
        assert_eq!(by_id_in(&rows, &done).status, "completed", "a finished turn is left alone");
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn by_id_in(rows: &[ExecutionRow], id: &str) -> ExecutionRow {
        rows.iter().find(|r| r.id == id).expect("row present").clone()
    }

    #[tokio::test]
    async fn drafts_round_trip_and_clear_when_emptied() {
        let (store, dir) = open_temp("draft").await;
        assert_eq!(store.get_draft("p::branch:d").await, (String::new(), vec![]));

        let img = StoredImage { media_type: "image/png".into(), data: "AAEC".into() };
        store.set_draft("p::branch:d", "half written", std::slice::from_ref(&img)).await.unwrap();
        let (text, images) = store.get_draft("p::branch:d").await;
        assert_eq!(text, "half written");
        assert_eq!(images, vec![img]);

        // Drafts are per branch — one branch's draft never leaks into another's composer.
        assert_eq!(store.get_draft("p::branch:other").await.0, "");

        // Emptying the composer clears the draft instead of leaving an empty row.
        store.set_draft("p::branch:d", "", &[]).await.unwrap();
        assert_eq!(store.get_draft("p::branch:d").await, (String::new(), vec![]));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn queue_is_fifo_per_branch_and_removable() {
        let (store, dir) = open_temp("queue").await;
        let first = store.enqueue_follow_up("p::branch:q", "first", &[]).await.unwrap();
        store.enqueue_follow_up("p::branch:q", "second", &[]).await.unwrap();
        store.enqueue_follow_up("p::branch:elsewhere", "other", &[]).await.unwrap();

        let q = store.list_queue("p::branch:q").await;
        assert_eq!(q.iter().map(|m| m.text.as_str()).collect::<Vec<_>>(), vec!["first", "second"]);
        assert_eq!(store.list_queue("p::branch:elsewhere").await.len(), 1, "queues are per branch");

        // Draining the head removes exactly it; a second removal reports false, which is how the
        // drain avoids re-sending a message another client already took.
        assert!(store.remove_queued(&first).await);
        assert!(!store.remove_queued(&first).await);
        assert_eq!(
            store.list_queue("p::branch:q").await.iter().map(|m| m.text.as_str()).collect::<Vec<_>>(),
            vec!["second"]
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Regression: `created_at` is only millisecond-resolution, so a burst of enqueues lands on the
    /// same timestamp. Ordering used to fall back to the random uuid, which delivered a user's
    /// messages out of order. Insertion order (rowid) must decide instead.
    #[tokio::test]
    async fn queue_stays_in_order_for_messages_enqueued_in_the_same_millisecond() {
        let (store, dir) = open_temp("fifo").await;
        let sent: Vec<String> = (0..25).map(|n| format!("msg-{n:02}")).collect();
        for t in &sent {
            store.enqueue_follow_up("p::branch:burst", t, &[]).await.unwrap();
        }
        let got: Vec<String> =
            store.list_queue("p::branch:burst").await.into_iter().map(|m| m.text).collect();
        assert_eq!(got, sent, "queued messages must come back in the order they were sent");

        // Draining follows the same order.
        let mut drained = Vec::new();
        while let Some(m) = store.take_next_queued("p::branch:burst").await {
            drained.push(m.text);
        }
        assert_eq!(drained, sent, "draining must also be FIFO");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn take_next_queued_claims_each_message_exactly_once() {
        let (store, dir) = open_temp("take").await;
        store.enqueue_follow_up("p::branch:t", "one", &[]).await.unwrap();
        store.enqueue_follow_up("p::branch:t", "two", &[]).await.unwrap();

        // FIFO, and each take removes what it claimed.
        assert_eq!(store.take_next_queued("p::branch:t").await.unwrap().text, "one");
        assert_eq!(store.take_next_queued("p::branch:t").await.unwrap().text, "two");
        assert!(store.take_next_queued("p::branch:t").await.is_none());

        // Concurrent drains must not deliver the same message twice — the delete is the claim.
        store.enqueue_follow_up("p::branch:t", "only", &[]).await.unwrap();
        let (a, b) = tokio::join!(
            store.take_next_queued("p::branch:t"),
            store.take_next_queued("p::branch:t")
        );
        let claimed: Vec<_> = [a, b].into_iter().flatten().collect();
        assert_eq!(claimed.len(), 1, "exactly one drain may claim a queued message");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn queued_images_survive_the_round_trip() {
        let (store, dir) = open_temp("qimg").await;
        let img = StoredImage { media_type: "image/png".into(), data: "Zm9v".into() };
        store.enqueue_follow_up("p::branch:i", "look", std::slice::from_ref(&img)).await.unwrap();
        let got = store.take_next_queued("p::branch:i").await.unwrap();
        assert_eq!(got.text, "look");
        assert_eq!(got.images, vec![img], "attachments must survive so a drained message can be sent");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn reconcile_clears_statuses_that_cannot_have_survived_a_restart() {
        let (store, dir) = open_temp("reconcile").await;
        store.upsert_session("p::branch:live", Some("s1"), "working", None).await.unwrap();
        store.upsert_session("p::branch:also", None, "idle", None).await.unwrap();
        store.upsert_session("p::branch:over", None, "done", None).await.unwrap();

        let mut fixed = store.reconcile_stale_statuses().await;
        fixed.sort();
        assert_eq!(fixed, vec!["p::branch:also", "p::branch:live"]);
        assert_eq!(store.get_session("p::branch:live").await.unwrap().status, "done");
        assert_eq!(store.get_session("p::branch:also").await.unwrap().status, "done");
        // An already-terminal row is untouched, and the session id survives reconciliation so the
        // branch can still be resumed.
        assert_eq!(store.get_session("p::branch:over").await.unwrap().status, "done");
        assert_eq!(store.get_session("p::branch:live").await.unwrap().session_id.as_deref(), Some("s1"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
