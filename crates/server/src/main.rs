use server::run::{
    self, KablanError, init_process, perform_cleanup_actions, port_from_env, shutdown_signal,
};
use utils::{browser::open_browser, port_file::write_port_file};

#[tokio::main]
async fn main() -> Result<(), KablanError> {
    init_process();

    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let bound = run::bind(&host, port_from_env()).await?;
    let port = bound.port;
    let deployment = bound.deployment.clone();

    // Production only: publish the port so the MCP binary can find us, and open a browser —
    // in development the frontend dev server is the thing you visit.
    if !cfg!(debug_assertions) {
        if let Err(e) = write_port_file(port).await {
            tracing::warn!("Failed to write port file: {}", e);
        }
        tracing::info!("Opening browser...");
        tokio::spawn(async move {
            if let Err(e) = open_browser(&format!("http://127.0.0.1:{port}")).await {
                tracing::warn!(
                    "Failed to open browser automatically: {}. Please open http://127.0.0.1:{} manually.",
                    e,
                    port
                );
            }
        });
    }

    bound.serve(shutdown_signal()).await?;

    perform_cleanup_actions(&deployment).await;

    Ok(())
}
