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

/// One branch's agent state as stored.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionRow {
    pub branch_key: String,
    pub session_id: Option<String>,
    pub status: String,
    pub worktree_path: Option<String>,
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
    async fn all_sessions_lists_every_branch() {
        let (store, dir) = open_temp("all").await;
        store.upsert_session("p::branch:a", Some("s1"), "idle", None).await.unwrap();
        store.upsert_session("p::branch:b", Some("s2"), "working", None).await.unwrap();
        let mut keys: Vec<String> = store.all_sessions().await.into_iter().map(|s| s.branch_key).collect();
        keys.sort();
        assert_eq!(keys, vec!["p::branch:a", "p::branch:b"]);
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
