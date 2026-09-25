//! Claude subscription sign-in, started from the app when a task dies with
//! "OAuth session expired".
//!
//! The CLI owns the token. This route only runs `claude auth login --claudeai`
//! (subscription, not Console API billing) and `claude auth status`. It does
//! not read the credential store.

use std::{
    path::PathBuf,
    process::Stdio,
    sync::{Arc, LazyLock},
    time::Duration,
};

use axum::{Router, response::Json as ResponseJson, routing::get};
use serde::{Deserialize, Serialize};
use strip_ansi_escapes::strip_str;
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Child,
    sync::Mutex,
    time::Instant,
};
use utils::{response::ApiResponse, shell::resolve_executable_path};

use crate::{DeploymentImpl, error::ApiError};

const STATUS_TIMEOUT: Duration = Duration::from_secs(15);
const LOGIN_URL_WAIT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Serialize)]
pub struct ClaudeAuthStatus {
    pub logged_in: bool,
    pub auth_method: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClaudeAuthLoginResponse {
    /// Printed by the CLI as "If the browser didn't open, visit: …".
    /// None when the CLI opened a browser without flushing a URL yet.
    pub url: Option<String>,
    /// False once `claude auth login` has exited.
    pub running: bool,
    /// Set when that process exited with a failure.
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CliStatus {
    #[serde(rename = "loggedIn", default)]
    logged_in: bool,
    #[serde(rename = "authMethod")]
    auth_method: Option<String>,
    email: Option<String>,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/claude/auth/status", get(status))
        .route("/claude/auth/login", get(login_state).post(login))
}

#[derive(Clone)]
struct LoginRun {
    url: Arc<Mutex<Option<String>>>,
    done: Arc<Mutex<Option<Result<(), String>>>>,
}

static LOGIN: LazyLock<Mutex<Option<LoginRun>>> = LazyLock::new(|| Mutex::new(None));

async fn status() -> Result<ResponseJson<ApiResponse<ClaudeAuthStatus>>, ApiError> {
    let raw = run_status().await?;
    let parsed: CliStatus = serde_json::from_str(raw.trim()).map_err(|err| {
        ApiError::BadRequest(format!(
            "Claude auth status was not the expected JSON: {err}"
        ))
    })?;

    Ok(ResponseJson(ApiResponse::success(ClaudeAuthStatus {
        logged_in: parsed.logged_in,
        auth_method: parsed.auth_method,
        email: parsed.email,
    })))
}

async fn login() -> Result<ResponseJson<ApiResponse<ClaudeAuthLoginResponse>>, ApiError> {
    let run = {
        let mut slot = LOGIN.lock().await;
        let still_running = match slot.as_ref() {
            Some(existing) => existing.done.lock().await.is_none(),
            None => false,
        };
        if still_running {
            slot.as_ref().cloned().expect("login is running")
        } else {
            let run = spawn_login().await?;
            *slot = Some(run.clone());
            run
        }
    };

    let state = wait_for_login(&run, LOGIN_URL_WAIT).await;
    Ok(ResponseJson(ApiResponse::success(state)))
}

async fn login_state() -> Result<ResponseJson<ApiResponse<ClaudeAuthLoginResponse>>, ApiError> {
    let slot = LOGIN.lock().await;
    let Some(run) = slot.as_ref() else {
        return Ok(ResponseJson(ApiResponse::success(
            ClaudeAuthLoginResponse {
                url: None,
                running: false,
                error: None,
            },
        )));
    };
    Ok(ResponseJson(ApiResponse::success(snapshot(run).await)))
}

async fn claude_program() -> Result<PathBuf, ApiError> {
    resolve_executable_path("claude").await.ok_or_else(|| {
        ApiError::BadRequest(
            "The Claude Code CLI is not on PATH, so Kablan cannot sign you in.".to_string(),
        )
    })
}

fn claude_command(program: PathBuf) -> tokio::process::Command {
    let mut command = tokio::process::Command::new(program);
    command
        .stdin(Stdio::null())
        .kill_on_drop(false)
        // A key in the environment bills the Console instead of the subscription
        // this login is for.
        .env_remove("ANTHROPIC_API_KEY");
    if let Some(home) = dirs::home_dir() {
        command.current_dir(home);
    }
    command
}

async fn run_status() -> Result<String, ApiError> {
    let mut command = claude_command(claude_program().await?);
    command
        .args(["auth", "status"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = tokio::time::timeout(STATUS_TIMEOUT, command.output())
        .await
        .map_err(|_| {
            ApiError::BadRequest("Claude auth status did not answer in time.".to_string())
        })?
        .map_err(|err| ApiError::BadRequest(format!("Could not run Claude auth status: {err}")))?;

    if !output.status.success() {
        let reason = strip_str(&String::from_utf8_lossy(&output.stderr))
            .trim()
            .to_string();
        return Err(ApiError::BadRequest(if reason.is_empty() {
            "Claude auth status failed.".to_string()
        } else {
            reason
        }));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

async fn spawn_login() -> Result<LoginRun, ApiError> {
    let mut command = claude_command(claude_program().await?);
    command
        .args(["auth", "login", "--claudeai"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|err| ApiError::BadRequest(format!("Could not start Claude sign-in: {err}")))?;

    let url = Arc::new(Mutex::new(None));
    let done = Arc::new(Mutex::new(None));
    let output = Arc::new(Mutex::new(String::new()));

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let url_task = url.clone();
    let output_task = output.clone();
    let done_task = done.clone();

    tokio::spawn(async move {
        // Both pipes at once: a full unread pipe would stall the CLI before it
        // prints the sign-in URL or opens the browser.
        let stdout_task = async {
            if let Some(stdout) = stdout {
                collect_output(stdout, &url_task, &output_task).await;
            }
        };
        let stderr_task = async {
            if let Some(stderr) = stderr {
                collect_output(stderr, &url_task, &output_task).await;
            }
        };
        tokio::join!(stdout_task, stderr_task);
        finish_login(child, &output_task, &done_task).await;
    });

    Ok(LoginRun { url, done })
}

async fn collect_output<R>(reader: R, url: &Mutex<Option<String>>, output: &Mutex<String>)
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let line = strip_str(&line);
        if let Some(found) = extract_login_url(&line) {
            let mut slot = url.lock().await;
            if slot.is_none() {
                *slot = Some(found);
            }
        }
        let mut buf = output.lock().await;
        if buf.len() < 8_000 {
            if !buf.is_empty() {
                buf.push('\n');
            }
            buf.push_str(line.trim());
        }
    }
}

async fn finish_login(
    mut child: Child,
    output: &Mutex<String>,
    done: &Mutex<Option<Result<(), String>>>,
) {
    let result = match child.wait().await {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => {
            let message = output.lock().await.clone();
            Err(if message.is_empty() {
                format!("Claude sign-in exited with {status}.")
            } else {
                message
            })
        }
        Err(err) => Err(format!("Claude sign-in failed: {err}")),
    };
    *done.lock().await = Some(result);
}

async fn snapshot(run: &LoginRun) -> ClaudeAuthLoginResponse {
    let url = run.url.lock().await.clone();
    match run.done.lock().await.clone() {
        None => ClaudeAuthLoginResponse {
            url,
            running: true,
            error: None,
        },
        Some(Ok(())) => ClaudeAuthLoginResponse {
            url,
            running: false,
            error: None,
        },
        Some(Err(message)) => ClaudeAuthLoginResponse {
            url,
            running: false,
            error: Some(message),
        },
    }
}

/// Wait until the CLI prints a URL, exits, or the timeout passes. A stored
/// "logged in" status is not enough: the session that just failed can still
/// look signed in until this process replaces it.
async fn wait_for_login(run: &LoginRun, timeout: Duration) -> ClaudeAuthLoginResponse {
    let deadline = Instant::now() + timeout;
    loop {
        let state = snapshot(run).await;
        if state.url.is_some() || !state.running || Instant::now() >= deadline {
            return state;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

/// The URL the CLI prints after "visit:". Anything else with https is a fallback.
fn extract_login_url(text: &str) -> Option<String> {
    let mut fallback = None;
    for line in text.lines() {
        let Some(url) = https_token(line) else {
            continue;
        };
        if line.to_ascii_lowercase().contains("visit:") {
            return Some(url);
        }
        fallback.get_or_insert(url);
    }
    fallback
}

fn https_token(line: &str) -> Option<String> {
    let start = line.find("https://")?;
    let rest = &line[start..];
    let end = rest
        .find(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | '<' | '>' | '…'))
        .unwrap_or(rest.len());
    let url = rest[..end].trim_end_matches(|c: char| matches!(c, '.' | ',' | ')' | ']'));
    if url.len() > "https://".len() {
        Some(url.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_visit_url() {
        let line = "If the browser didn't open, visit: https://claude.ai/oauth/authorize?code=abc.";
        assert_eq!(
            extract_login_url(line).as_deref(),
            Some("https://claude.ai/oauth/authorize?code=abc")
        );
    }

    #[test]
    fn prefers_the_visit_line_over_an_earlier_link() {
        let text = "See https://docs.claude.com/login\nIf the browser didn't open, visit: https://claude.ai/oauth/authorize?x=1\n";
        assert_eq!(
            extract_login_url(text).as_deref(),
            Some("https://claude.ai/oauth/authorize?x=1")
        );
    }

    #[test]
    fn skips_lines_without_a_url() {
        let text = "Opening browser to sign in\nIf the browser didn't open, visit: https://claude.ai/oauth/authorize?x=1\n";
        assert_eq!(
            extract_login_url(text).as_deref(),
            Some("https://claude.ai/oauth/authorize?x=1")
        );
    }

    #[test]
    fn no_url_is_none() {
        assert_eq!(extract_login_url("Opening browser…"), None);
    }
}
