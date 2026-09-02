use std::{path::PathBuf, process::Command};

use axum::{Json, Router, routing::post};
use serde::Serialize;
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::DeploymentImpl;

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct UpdateRestartResponse {
    /// What will happen, for the UI to show while the socket drops and the app comes back.
    pub message: String,
}

/// Update to the latest release and reopen the app — the manual `npx kablan@latest` in one click.
///
/// The running server is a binary the npm wrapper downloaded; it cannot swap itself out from
/// under its own feet. So this hands the job to a helper that outlives it: the helper waits for
/// this process to exit, runs the same install the user would run by hand, and reopens the app,
/// which starts the new server. This endpoint spawns that helper and then asks itself to shut
/// down the graceful way, so agents and dev servers are stopped first.
///
/// Only when running the installed app. From a dev build or a bare binary there is nothing to
/// relaunch, and the caller is told so — the banner keeps offering the copyable command instead.
/// If the update itself fails, the helper still reopens the existing app, so a bad release cannot
/// leave someone with no app at all.
pub async fn update_and_restart()
-> Result<Json<ApiResponse<UpdateRestartResponse>>, Json<ApiResponse<UpdateRestartResponse>>> {
    let ctx = match install_context() {
        Some(ctx) => ctx,
        None => {
            return Err(Json(ApiResponse::error(
                "This build cannot restart itself. Quit and run `npx kablan@latest`.",
            )));
        }
    };

    if let Err(e) = spawn_update_helper(&ctx) {
        tracing::error!("Failed to spawn update helper: {e}");
        return Err(Json(ApiResponse::error(
            "Could not start the update. Quit and run `npx kablan@latest`.",
        )));
    }

    // The helper is now waiting for us to exit. Leave through the normal shutdown so it can proceed.
    tokio::spawn(async {
        // A beat, so this response reaches the browser before the socket drops.
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        utils::process::request_self_shutdown();
    });

    Ok(Json(ApiResponse::success(UpdateRestartResponse {
        message: "Updating and restarting — the app will reopen in a moment.".to_string(),
    })))
}

/// Where this server is running from, when it is one we know how to relaunch.
struct InstallContext {
    /// The `.app` to reopen, when installed as one. Absent means relaunch through npx alone.
    app_bundle: Option<PathBuf>,
}

/// Recognise the installed app the same way the installer's own process scan does: the executable
/// lives in a directory the CLI owns — the version cache under `~/.kablan/bin`, or the app bundle.
/// Anything else (a dev `target/` build, a bare checkout binary) returns None.
fn install_context() -> Option<InstallContext> {
    let exe = std::env::current_exe().ok()?;
    let exe_str = exe.to_string_lossy();

    let from_cache = exe_str.contains("/.kablan/bin/");
    let from_bundle = exe_str.contains("/Kablan.app/Contents/MacOS/");
    if !from_cache && !from_bundle {
        return None;
    }

    let app_bundle = dirs_home()
        .map(|home| home.join("Applications").join("Kablan.app"))
        .filter(|p| p.exists());

    Some(InstallContext { app_bundle })
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// Detach a helper that survives this process's death, updates, and reopens the app.
fn spawn_update_helper(ctx: &InstallContext) -> std::io::Result<()> {
    let pid = std::process::id();
    let log = dirs_home()
        .map(|h| h.join("Library/Logs/Kablan/update.log"))
        .unwrap_or_else(|| PathBuf::from("/tmp/kablan-update.log"));
    let log = log.to_string_lossy();

    // Reopen the bundle when there is one — its launcher runs `npx kablan@latest`, which is the
    // newly installed version. Without a bundle, start the server straight from npx.
    let reopen = match &ctx.app_bundle {
        Some(app) => format!("open {}", shell_quote(&app.to_string_lossy())),
        None => "npx -y kablan@latest".to_string(),
    };

    // Waits for us to exit, updates, reopens — and reopens even if the update fails, so a bad
    // release never leaves the app gone. `nohup` and redirected stdio keep it alive once the
    // server (its parent) is gone and reparented to launchd.
    let script = format!(
        r#"
echo "$(date '+%Y-%m-%d %H:%M:%S') update requested; waiting for server (pid {pid}) to exit" >> {log}
while kill -0 {pid} 2>/dev/null; do sleep 0.3; done
echo "$(date '+%Y-%m-%d %H:%M:%S') server exited; installing latest" >> {log}
if npx -y kablan@latest --install >> {log} 2>&1; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') install ok" >> {log}
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') install failed; reopening the current version" >> {log}
fi
{reopen} >> {log} 2>&1
echo "$(date '+%Y-%m-%d %H:%M:%S') reopened" >> {log}
"#,
        pid = pid,
        log = shell_quote(&log),
        reopen = reopen,
    );

    Command::new("nohup")
        .arg("sh")
        .arg("-c")
        .arg(script)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
}

/// Single-quote for `sh`, closing and reopening around any embedded quote.
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/system/update-and-restart", post(update_and_restart))
}
