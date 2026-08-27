//! Periodic `git fetch` for every configured repo.
//!
//! Without this, branch lists and remote-tracking state only refresh when the user fetches by
//! hand, so the UI can show a stale picture of the remote. This keeps them current in the
//! background. It is opt-in (`auto_fetch_enabled`), because it makes network calls on the user's
//! behalf, and it is deliberately conservative: a repo that fails is logged and skipped, never
//! retried tightly or allowed to take the loop down.

use std::{sync::Arc, time::Duration};

use db::{DBService, models::repo::Repo};
use tokio::{sync::RwLock, time::interval};
use tracing::{debug, error, info, warn};

use crate::services::config::Config;

pub struct AutoFetchService {
    db: DBService,
    config: Arc<RwLock<Config>>,
}

impl AutoFetchService {
    /// Start the background loop. Returns immediately; the handle is kept by the caller so the
    /// task lives as long as the app.
    pub fn spawn(db: DBService, config: Arc<RwLock<Config>>) -> tokio::task::JoinHandle<()> {
        let service = Self { db, config };
        tokio::spawn(async move { service.run().await })
    }

    async fn run(&self) {
        // The interval is re-read every tick rather than captured once, so changing it in
        // Settings takes effect without restarting the app.
        loop {
            let (enabled, minutes) = {
                let cfg = self.config.read().await;
                (cfg.auto_fetch_enabled, cfg.auto_fetch_interval_minutes)
            };
            // Guard against 0, which would spin this loop as fast as the CPU allows.
            let minutes = minutes.max(1) as u64;

            if enabled {
                self.fetch_all_repos().await;
            }

            let mut tick = interval(Duration::from_secs(minutes * 60));
            tick.tick().await; // fires immediately
            tick.tick().await; // the actual wait
        }
    }

    async fn fetch_all_repos(&self) {
        let repos = match Repo::list_all(&self.db.pool).await {
            Ok(repos) => repos,
            Err(e) => {
                error!("auto-fetch: could not list repos: {e}");
                return;
            }
        };
        if repos.is_empty() {
            return;
        }
        info!("auto-fetch: refreshing {} repo(s)", repos.len());

        for repo in repos {
            let path = repo.path.clone();
            let name = repo.display_name.clone();
            // git is blocking, so keep it off the async runtime's worker threads.
            let result = tokio::task::spawn_blocking(move || {
                git::GitService::new().fetch_all_remotes(&path)
            })
            .await;

            match result {
                Ok(Ok(())) => debug!("auto-fetch: {name} up to date"),
                // A single unreachable remote or missing credential must not stop the others.
                Ok(Err(e)) => warn!("auto-fetch: {name} failed: {e}"),
                Err(e) => error!("auto-fetch: {name} task panicked: {e}"),
            }
        }
    }
}
