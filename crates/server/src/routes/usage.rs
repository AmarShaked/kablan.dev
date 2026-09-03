//! Claude subscription usage, read by asking the Claude Code CLI for it.
//!
//! The obvious way to get these numbers is the endpoint the CLI's own `/usage`
//! panel fetches, `GET /api/oauth/usage`. This route deliberately does not do
//! that, for two reasons found by trying it:
//!
//! - It needs the user's subscription OAuth token, which grants full API
//!   access. Borrowing it means reading a secret out of the CLI's credential
//!   store — or the macOS Keychain — holding it in this process, and owning its
//!   expiry. A sidebar bar is not worth handling somebody's token.
//! - The endpoint is internal and its shape has already moved. An earlier
//!   version of this file read `rate_limits.five_hour`; the live payload has
//!   `five_hour` at the top level and no `rate_limits` at all, so that parser
//!   quietly returned "no windows" against the real API.
//!
//! So instead we shell out to `claude -p "/usage"`, which is the same panel the
//! user sees, over a supported surface, with no credential in our hands. The
//! costs of that choice, and how they are contained:
//!
//! - It takes ~4.5s: full Node startup on a 200MB binary, and stripping MCP
//!   servers does not make it faster (measured — it is the startup, not the
//!   servers). Hence [`TTL`] and the single-flight lock: a hover, a poll and
//!   three browser tabs share one spawn.
//! - It prints prose for humans, so [`parse_usage`] reads English. It takes
//!   only the percentages as numbers and keeps each reset time as the CLI's own
//!   literal words, so a wording change upstream costs us a bar rather than
//!   showing a confidently wrong time. Unrecognised output means "no windows",
//!   never a zero — an empty bar reads as headroom the user may not have.

use std::{
    process::Stdio,
    sync::LazyLock,
    time::{Duration, Instant},
};

use axum::{Router, extract::Query, response::Json as ResponseJson, routing::get};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use ts_rs::TS;
use utils::{response::ApiResponse, shell::resolve_executable_path};

use crate::{DeploymentImpl, error::ApiError};

/// How long a reading stays good. The session window moves by a percent or two
/// a minute under load, and each refresh costs a ~4.5s process spawn.
const TTL: Duration = Duration::from_secs(60);

/// Generous next to the ~4.5s we measured, because the failure mode of being
/// impatient here is a footer that never fills in on a slower machine.
const CLI_TIMEOUT: Duration = Duration::from_secs(25);

/// One rate-limit window, as the sidebar draws it.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct UsageWindow {
    /// Short label, e.g. 'Session', 'Week (all models)', 'Week (Opus)'.
    pub label: String,
    /// Percentage of the window consumed, 0–100.
    pub percent: f64,
    /// When the window rolls over, in the CLI's own words — 'Sep 7 at 8:59am
    /// (Asia/Jerusalem)'. Kept as text rather than a timestamp so we are never
    /// re-deriving a time from prose; None when the CLI omits it.
    pub resets: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct UsageResponse {
    /// The rolling session window — the one bar the sidebar shows at rest.
    /// None when the CLI reports no session limit.
    pub session: Option<UsageWindow>,
    /// Weekly windows, revealed on hover.
    pub weekly: Vec<UsageWindow>,
    /// When this reading was taken, so the sidebar can say how old it is.
    pub fetched_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UsageParams {
    /// Set by the footer's refresh button to spend a spawn on a fresh reading
    /// instead of being handed the cached one.
    #[serde(default)]
    refresh: bool,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/usage", get(get_usage))
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/// Read one `Current …: N% used · resets …` line, or None for anything else.
///
/// The CLI prints a paragraph of prose around these lines and a usage breakdown
/// below them; this recognises the shape rather than the specific windows, so a
/// plan with windows we have never seen still gets its bars.
fn parse_line(line: &str) -> Option<UsageWindow> {
    let rest = line.trim().strip_prefix("Current ")?;
    let (label, rest) = rest.split_once(": ")?;
    let (percent, rest) = rest.split_once('%')?;
    let percent: f64 = percent.trim().parse().ok()?;

    // 'session' -> 'Session', 'week (all models)' -> 'Week (all models)'.
    let mut label: String = label.trim().to_string();
    if let Some(first) = label.get_mut(0..1) {
        first.make_ascii_uppercase();
    }

    Some(UsageWindow {
        label,
        percent: percent.clamp(0.0, 100.0),
        // Everything after 'resets ' verbatim, including the timezone the CLI
        // has already resolved for this machine.
        resets: rest
            .split_once("resets ")
            .map(|(_, when)| when.trim().to_string())
            .filter(|when| !when.is_empty()),
    })
}

/// Split the CLI's output into the session window and the weekly ones.
///
/// Windows are sorted by what they are called because that is all the CLI tells
/// us: 'Current session' is the one that interrupts work, anything 'week' is a
/// weekly window, and a line we cannot place is dropped rather than guessed at.
fn parse_usage(stdout: &str, fetched_at: DateTime<Utc>) -> UsageResponse {
    let mut session = None;
    let mut weekly = Vec::new();

    for window in stdout.lines().filter_map(parse_line) {
        let kind = window.label.to_ascii_lowercase();
        if kind.starts_with("session") {
            // First wins: a second session line would be the CLI having changed
            // shape, and the first is the one it leads with.
            session.get_or_insert(window);
        } else if kind.starts_with("week") {
            weekly.push(window);
        }
    }

    UsageResponse {
        session,
        weekly,
        fetched_at,
    }
}

// ---------------------------------------------------------------------------
// The CLI
// ---------------------------------------------------------------------------

/// Ask the CLI for its usage panel.
///
/// `--strict-mcp-config` with an empty server map is not about speed (it is not
/// faster); it keeps this from starting the user's MCP servers, so a background
/// poll cannot trip an auth prompt or a flaky server on its way to reading two
/// percentages.
async fn run_cli() -> Result<String, ApiError> {
    let program = resolve_executable_path("claude").await.ok_or_else(|| {
        ApiError::BadRequest(
            "The Claude Code CLI is not on PATH, so its usage cannot be read.".to_string(),
        )
    })?;

    let mut command = tokio::process::Command::new(program);
    command
        .arg("-p")
        .arg("/usage")
        .args(["--output-format", "text"])
        .arg("--strict-mcp-config")
        .args(["--mcp-config", r#"{"mcpServers":{}}"#])
        .stdin(Stdio::null())
        .kill_on_drop(true);

    // Run somewhere neutral: a repo would pull in its CLAUDE.md, its settings
    // and its trust state, none of which have anything to do with usage.
    if let Some(home) = dirs::home_dir() {
        command.current_dir(home);
    }

    let output = tokio::time::timeout(CLI_TIMEOUT, command.output())
        .await
        .map_err(|_| {
            ApiError::BadRequest(format!(
                "The Claude Code CLI did not answer within {}s.",
                CLI_TIMEOUT.as_secs()
            ))
        })?
        .map_err(|e| ApiError::BadRequest(format!("Could not run the Claude Code CLI: {e}")))?;

    if !output.status.success() {
        // The CLI puts the reason on stderr — a missing login, a rejected
        // token — and it is written for a person, so pass it straight through.
        let reason = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(ApiError::BadRequest(if reason.is_empty() {
            "The Claude Code CLI could not report usage.".to_string()
        } else {
            reason
        }));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

struct Cached {
    at: Instant,
    value: UsageResponse,
}

/// One reading for the whole app. Holding this across the spawn is also what
/// makes the fetch single-flight: a second caller waits on the lock and then
/// finds the answer already in it, rather than starting a second CLI.
static CACHE: LazyLock<Mutex<Option<Cached>>> = LazyLock::new(|| Mutex::new(None));

async fn get_usage(
    Query(params): Query<UsageParams>,
) -> Result<ResponseJson<ApiResponse<UsageResponse>>, ApiError> {
    let mut cache = CACHE.lock().await;

    if !params.refresh
        && let Some(cached) = cache.as_ref()
        && cached.at.elapsed() < TTL
    {
        return Ok(ResponseJson(ApiResponse::success(cached.value.clone())));
    }

    let stdout = run_cli().await?;
    let value = parse_usage(&stdout, Utc::now());

    *cache = Some(Cached {
        at: Instant::now(),
        value: value.clone(),
    });

    Ok(ResponseJson(ApiResponse::success(value)))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Captured verbatim from `claude -p "/usage"` — including the breakdown
    /// below the windows, which is the part most likely to grow lines that look
    /// almost parseable.
    const OUTPUT: &str = "You are currently using your subscription to power your Claude Code usage

Current session: 4% used · resets Sep 4 at 2:49am (Asia/Jerusalem)
Current week (all models): 40% used · resets Sep 7 at 8:59am (Asia/Jerusalem)
Current week (Fable): 7% used · resets Sep 7 at 8:59am (Asia/Jerusalem)

What's contributing to your limits usage?
Approximate, based on local sessions on this machine.

Last 24h · 1911 requests · 33 sessions
  74% of your usage was at >150k context
  Top skills: /superpowers:systematic-debugging 1%
";

    fn parse(raw: &str) -> UsageResponse {
        parse_usage(raw, Utc::now())
    }

    #[test]
    fn reads_the_session_window() {
        let session = parse(OUTPUT).session.expect("session window");

        assert_eq!(session.label, "Session");
        assert_eq!(session.percent, 4.0);
        // The CLI's words, kept whole: it has already worked out the timezone.
        assert_eq!(
            session.resets.as_deref(),
            Some("Sep 4 at 2:49am (Asia/Jerusalem)")
        );
    }

    #[test]
    fn keeps_every_weekly_window_in_order() {
        let weekly = parse(OUTPUT).weekly;

        assert_eq!(weekly.len(), 2);
        assert_eq!(weekly[0].label, "Week (all models)");
        assert_eq!(weekly[0].percent, 40.0);
        // A per-model window we have no list of: taken because it is called a
        // week, not because we recognise the model.
        assert_eq!(weekly[1].label, "Week (Fable)");
        assert_eq!(weekly[1].percent, 7.0);
    }

    #[test]
    fn ignores_the_prose_and_the_breakdown() {
        // Nothing from the paragraph, the headings, or the '74% of your usage'
        // lines should reach a bar.
        let got = parse(OUTPUT);
        assert_eq!(got.weekly.len(), 2);
        assert!(got.session.is_some());
    }

    #[test]
    fn an_api_key_account_has_no_windows() {
        // What the CLI prints when usage is billed per-token: no windows to
        // report, so the footer has nothing to draw and hides itself.
        let got = parse("Your Claude Code usage is billed via the Anthropic API.\n");

        assert!(got.session.is_none());
        assert!(got.weekly.is_empty());
    }

    #[test]
    fn unrecognised_output_draws_nothing() {
        // The point of the whole design: when the prose changes we lose the
        // bars, we do not invent a 0%.
        let got = parse("Session usage: nearly all of it\n\nCurrent session\n");

        assert!(got.session.is_none());
        assert!(got.weekly.is_empty());
    }

    #[test]
    fn a_window_without_a_reset_time_still_counts() {
        let session = parse("Current session: 12% used\n")
            .session
            .expect("session window");

        assert_eq!(session.percent, 12.0);
        assert_eq!(session.resets, None);
    }

    #[test]
    fn percentages_are_clamped() {
        let session = parse("Current session: 140% used · resets soon\n")
            .session
            .expect("session window");

        assert_eq!(session.percent, 100.0);
        assert_eq!(session.resets.as_deref(), Some("soon"));
    }
}
