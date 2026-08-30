//! Starting the server, without deciding how it is hosted.
//!
//! The CLI binary and the desktop app both need the same sequence — install the crypto provider,
//! build the deployment, run the startup backfills, bind a port — but they differ in what happens
//! afterwards: the CLI opens a browser and waits for Ctrl-C, the desktop app opens a window and
//! lets Tauri own the lifetime. Everything common lives here so the two cannot drift.

use std::sync::Once;

use anyhow::Error as AnyhowError;
use deployment::{Deployment, DeploymentError};
use services::services::container::ContainerService;
use sqlx::Error as SqlxError;
use thiserror::Error;
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    assets::asset_dir,
    sentry::{self as sentry_utils, SentrySource, sentry_layer},
};

use crate::{DeploymentImpl, routes};

#[derive(Debug, Error)]
pub enum KablanError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
    #[error(transparent)]
    Deployment(#[from] DeploymentError),
    #[error(transparent)]
    Other(#[from] AnyhowError),
}

static INIT: Once = Once::new();

/// Process-wide setup that must happen exactly once and before anything else.
///
/// The desktop app calls this from its own runtime, so it has to tolerate being reached twice
/// (installing the rustls provider a second time is an error, not a no-op).
pub fn init_process(source: SentrySource) {
    INIT.call_once(|| {
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

        sentry_utils::init_once(source);

        let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());
        let filter_string = format!(
            "warn,server={level},services={level},db={level},executors={level},deployment={level},local_deployment={level},utils={level}",
            level = log_level
        );
        let env_filter =
            EnvFilter::try_new(filter_string).expect("Failed to create tracing filter");
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer().with_filter(env_filter))
            .with(sentry_layer())
            .init();
    });
}

/// Build the deployment and run the startup work that has to finish before requests are served:
/// orphaned executions from a previous run are reaped, and the backfills bring older databases
/// up to what the current code expects.
pub async fn build_deployment() -> Result<DeploymentImpl, KablanError> {
    if !asset_dir().exists() {
        std::fs::create_dir_all(asset_dir())?;
    }

    let deployment = DeploymentImpl::new().await?;
    deployment.update_sentry_scope().await?;
    deployment
        .container()
        .cleanup_orphan_executions()
        .await
        .map_err(DeploymentError::from)?;
    deployment
        .container()
        .backfill_before_head_commits()
        .await
        .map_err(DeploymentError::from)?;
    deployment
        .container()
        .backfill_repo_names()
        .await
        .map_err(DeploymentError::from)?;
    deployment
        .track_if_analytics_allowed("session_start", serde_json::json!({}))
        .await;

    // Warming the search cache is slow and nothing waits on it.
    let deployment_for_cache = deployment.clone();
    tokio::spawn(async move {
        if let Err(e) = deployment_for_cache
            .file_search_cache()
            .warm_most_active(&deployment_for_cache.db().pool, 3)
            .await
        {
            tracing::warn!("Failed to warm file search cache: {}", e);
        }
    });

    Ok(deployment)
}

/// A bound server: the port it actually got, and the deployment behind it.
pub struct Bound {
    pub port: u16,
    pub deployment: DeploymentImpl,
    listener: tokio::net::TcpListener,
}

impl Bound {
    /// Serve until `shutdown` resolves.
    pub async fn serve<F>(self, shutdown: F) -> Result<(), KablanError>
    where
        F: std::future::Future<Output = ()> + Send + 'static,
    {
        let router = routes::router(self.deployment.clone());
        axum::serve(self.listener, router)
            .with_graceful_shutdown(shutdown)
            .await?;
        Ok(())
    }
}

/// Bind `host:port` and prepare everything needed to serve. Port 0 asks the OS for a free one;
/// the port that was actually granted is on the returned value, which is how the desktop app
/// learns where to point its window.
pub async fn bind(host: &str, port: u16) -> Result<Bound, KablanError> {
    let deployment = build_deployment().await?;
    let listener = tokio::net::TcpListener::bind(format!("{host}:{port}")).await?;
    let port = listener.local_addr()?.port();
    tracing::info!("Server running on http://{host}:{port}");
    Ok(Bound {
        port,
        deployment,
        listener,
    })
}

/// Kill child processes so a quit doesn't leave dev servers and agents running.
pub async fn perform_cleanup_actions(deployment: &DeploymentImpl) {
    if let Err(e) = deployment.container().kill_all_running_processes().await {
        tracing::error!("Failed to cleanly kill running execution processes: {e}");
    }
}

/// Resolve the port the CLI should use from the environment, falling back to 0 (OS-assigned).
pub fn port_from_env() -> u16 {
    use strip_ansi_escapes::strip;

    std::env::var("BACKEND_PORT")
        .or_else(|_| std::env::var("PORT"))
        .ok()
        .and_then(|s| {
            let cleaned =
                String::from_utf8(strip(s.as_bytes())).expect("UTF-8 after stripping ANSI");
            cleaned.trim().parse::<u16>().ok()
        })
        .unwrap_or_else(|| {
            tracing::info!("No PORT environment variable set, using port 0 for auto-assignment");
            0
        })
}

/// Resolve when the OS asks the process to stop.
pub async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(e) = tokio::signal::ctrl_c().await {
            tracing::error!("Failed to install Ctrl+C handler: {e}");
        }
    };

    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};

        let terminate = async {
            if let Ok(mut sigterm) = signal(SignalKind::terminate()) {
                sigterm.recv().await;
            } else {
                tracing::error!("Failed to install SIGTERM handler");
                std::future::pending::<()>().await;
            }
        };

        tokio::select! {
            _ = ctrl_c => {},
            _ = terminate => {},
        }
    }

    #[cfg(not(unix))]
    ctrl_c.await;
}
