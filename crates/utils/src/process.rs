use command_group::AsyncGroupChild;
#[cfg(unix)]
use nix::{
    sys::signal::{Signal, killpg},
    unistd::{Pid, getpgid},
};
#[cfg(unix)]
use tokio::time::Duration;

pub async fn kill_process_group(child: &mut AsyncGroupChild) -> std::io::Result<()> {
    // hit the whole process group, not just the leader
    #[cfg(unix)]
    {
        if let Some(pid) = child.inner().id() {
            let pgid = getpgid(Some(Pid::from_raw(pid as i32)))
                .map_err(|e| std::io::Error::other(e.to_string()))?;

            for sig in [Signal::SIGINT, Signal::SIGTERM, Signal::SIGKILL] {
                tracing::info!("Sending {:?} to process group {}", sig, pgid);
                if let Err(e) = killpg(pgid, sig) {
                    tracing::warn!(
                        "Failed to send signal {:?} to process group {}: {}",
                        sig,
                        pgid,
                        e
                    );
                }
                tracing::info!("Waiting 2s for process group {} to exit", pgid);
                tokio::time::sleep(Duration::from_secs(2)).await;
                if child.inner().try_wait()?.is_some() {
                    tracing::info!("Process group {} exited after {:?}", pgid, sig);
                    break;
                }
            }
        }
    }

    let _ = child.kill().await;
    let _ = child.wait().await;
    Ok(())
}

/// Ask our own process to shut down the graceful way — the same path Ctrl-C and a `kill` take.
///
/// The update flow uses this: it spawns a detached helper that waits for us to exit, then quits
/// through the normal shutdown so child agents and dev servers are cleaned up first, rather than
/// calling `exit()` and orphaning them. A no-op off Unix; the installed app is macOS only.
#[cfg(unix)]
pub fn request_self_shutdown() {
    use nix::{
        sys::signal::{Signal, kill},
        unistd::getpid,
    };

    if let Err(e) = kill(getpid(), Signal::SIGTERM) {
        tracing::error!("Failed to signal self for shutdown: {e}");
    }
}

#[cfg(not(unix))]
pub fn request_self_shutdown() {
    tracing::warn!("request_self_shutdown is only implemented on Unix");
}
