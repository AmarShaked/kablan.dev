//! Claude subscription usage, read through the Claude Code CLI's own credentials.
//!
//! The CLI's `/usage` panel fetches `GET /api/oauth/usage` on Anthropic's API with
//! the user's subscription OAuth token. Kablan has no such token of its own — its
//! OAuth is for kablan's remote service — so this route borrows the CLI's, which
//! is why it is deliberately narrow:
//!
//! - The token is read on demand, used for one request, and dropped. It is never
//!   logged, persisted, or included in a response. It grants full API access, so
//!   treat any change here as touching a secret.
//! - `/api/oauth/usage` is an internal endpoint of the CLI, not part of the
//!   documented public API. It carries no compatibility promise and can change
//!   shape without notice; `parse_usage` is written to degrade to "no windows"
//!   rather than fail when fields go missing.

use std::{path::PathBuf, time::Duration};

use axum::{Router, response::Json as ResponseJson, routing::get};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

/// The endpoint the CLI's own usage panel fetches. Auth on this host is checked
/// before routing — a nonsense path answers 401 just like a bad token — so a
/// probe cannot confirm this URL; it is taken from the shipping CLI's request.
const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";

/// The CLI gives up after 5s; a sidebar has even less patience.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);

/// One rate-limit window, as the sidebar draws it.
#[derive(Debug, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct UsageWindow {
    /// Short label, e.g. 'Session', 'Week', 'Week (Sonnet)'.
    pub label: String,
    /// Percentage of the window consumed, 0–100.
    pub percent: f64,
    /// When the window rolls over. None when upstream omits it.
    pub resets_at: Option<DateTime<Utc>>,
}

#[derive(Debug, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct UsageResponse {
    /// The rolling session window — the one bar the sidebar shows at rest.
    /// None when the account reports no session limit.
    pub session: Option<UsageWindow>,
    /// Weekly windows, revealed on hover.
    pub weekly: Vec<UsageWindow>,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/usage", get(get_usage))
}

// ---------------------------------------------------------------------------
// Upstream shape
// ---------------------------------------------------------------------------

/// Every field is optional: this is an undocumented endpoint, and a missing
/// window should cost us that one bar rather than the whole response.
#[derive(Debug, Default, Deserialize)]
struct Upstream {
    #[serde(default)]
    rate_limits: Option<UpstreamRateLimits>,
    #[serde(default)]
    subscription_type: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct UpstreamRateLimits {
    #[serde(default)]
    five_hour: Option<UpstreamLimit>,
    #[serde(default)]
    seven_day: Option<UpstreamLimit>,
    #[serde(default)]
    seven_day_sonnet: Option<UpstreamLimit>,
}

#[derive(Debug, Default, Deserialize)]
struct UpstreamLimit {
    /// Already a percentage (0–100) — the CLI renders it with a plain floor, no
    /// scaling. Null means the account has no figure for this window.
    #[serde(default)]
    utilization: Option<f64>,
    #[serde(default)]
    resets_at: Option<DateTime<Utc>>,
}

fn window(label: &str, limit: Option<UpstreamLimit>) -> Option<UsageWindow> {
    let limit = limit?;
    // A null utilization is upstream saying "no figure", not zero — drawing it
    // as an empty bar would read as plenty of headroom.
    let percent = limit.utilization?;
    Some(UsageWindow {
        label: label.to_string(),
        percent: percent.clamp(0.0, 100.0),
        resets_at: limit.resets_at,
    })
}

/// Split the upstream payload into the session window and the weekly ones.
///
/// The per-model weekly window only applies to the plans that meter a model
/// apart, which the CLI keys off `subscription_type` — so an absent or
/// unrecognised subscription type keeps it, matching the CLI's own default.
fn parse_usage(upstream: Upstream) -> UsageResponse {
    let Some(limits) = upstream.rate_limits else {
        return UsageResponse {
            session: None,
            weekly: Vec::new(),
        };
    };

    let per_model_weekly = matches!(
        upstream.subscription_type.as_deref(),
        Some("max") | Some("team") | None
    );

    let mut weekly = Vec::new();
    if let Some(w) = window("Week", limits.seven_day) {
        weekly.push(w);
    }
    if per_model_weekly && let Some(w) = window("Week (Sonnet)", limits.seven_day_sonnet) {
        weekly.push(w);
    }

    UsageResponse {
        session: window("Session", limits.five_hour),
        weekly,
    }
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct CredentialsFile {
    #[serde(rename = "claudeAiOauth")]
    claude_ai_oauth: Option<OauthCredentials>,
}

#[derive(Debug, Deserialize)]
struct OauthCredentials {
    #[serde(rename = "accessToken")]
    access_token: Option<String>,
}

fn credentials_path() -> Option<PathBuf> {
    Some(dirs::home_dir()?.join(".claude").join(".credentials.json"))
}

/// The CLI's own two plaintext credential sources, in its order of preference.
///
/// On macOS the CLI can instead keep these in the Keychain, which this does not
/// read — the error below names the environment variable so that setup has a way
/// through rather than a silent empty sidebar.
fn load_token() -> Result<String, ApiError> {
    if let Ok(token) = std::env::var("CLAUDE_CODE_OAUTH_TOKEN")
        && !token.trim().is_empty()
    {
        return Ok(token);
    }

    let path = credentials_path()
        .ok_or_else(|| ApiError::BadRequest("Could not locate a home directory".to_string()))?;

    // Deliberately not distinguishing "no file" from "unreadable file": both mean
    // the same thing to the caller, and the path is the useful part either way.
    let raw = std::fs::read_to_string(&path).map_err(|_| {
        ApiError::BadRequest(format!(
            "No Claude Code credentials at {}. Log in with the Claude Code CLI, \
             or set CLAUDE_CODE_OAUTH_TOKEN.",
            path.display()
        ))
    })?;

    let parsed: CredentialsFile = serde_json::from_str(&raw).map_err(|_| {
        ApiError::BadRequest(format!(
            "Could not read {} — set CLAUDE_CODE_OAUTH_TOKEN instead.",
            path.display()
        ))
    })?;

    parsed
        .claude_ai_oauth
        .and_then(|c| c.access_token)
        .filter(|t| !t.trim().is_empty())
        .ok_or_else(|| {
            ApiError::BadRequest(
                "Claude Code credentials hold no access token. Log in again with the CLI, \
                 or set CLAUDE_CODE_OAUTH_TOKEN."
                    .to_string(),
            )
        })
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

async fn get_usage() -> Result<ResponseJson<ApiResponse<UsageResponse>>, ApiError> {
    let token = load_token()?;

    let response = reqwest::Client::new()
        .get(USAGE_URL)
        // Bearer, not x-api-key: this is a subscription OAuth token. Headers
        // deliberately mirror the CLI's own request for this endpoint — notably
        // no `anthropic-beta`, which it does not send here.
        .bearer_auth(&token)
        .header("Content-Type", "application/json")
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|e| {
            // `e` can carry the request URL but never the Authorization header,
            // so this is safe to surface.
            ApiError::BadRequest(format!("Could not reach the usage endpoint: {e}"))
        })?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        // The CLI refreshes on 401 and retries; this only reads the token, and
        // spending the refresh token would mean writing back to the CLI's own
        // credential store — a race with the CLI over a secret, for a sidebar
        // bar. Hand the refresh back to the tool that owns it instead.
        return Err(ApiError::BadRequest(
            "Claude Code credentials were rejected — they may have expired. \
             Run any Claude Code command to refresh them, then retry."
                .to_string(),
        ));
    }

    if !response.status().is_success() {
        return Err(ApiError::BadRequest(format!(
            "Usage endpoint returned {}",
            response.status()
        )));
    }

    let upstream: Upstream = response
        .json()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Unexpected usage response: {e}")))?;

    Ok(ResponseJson(ApiResponse::success(parse_usage(upstream))))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Shaped after the payload the CLI reads: percentages already 0–100,
    /// RFC 3339 reset stamps, and a per-model weekly window.
    const PAYLOAD: &str = r#"{
        "subscription_type": "max",
        "rate_limits": {
            "five_hour":        { "utilization": 78.4, "resets_at": "2026-09-03T21:00:00Z" },
            "seven_day":        { "utilization": 31.2, "resets_at": "2026-09-07T00:00:00Z" },
            "seven_day_sonnet": { "utilization": 12.0, "resets_at": "2026-09-07T00:00:00Z" }
        }
    }"#;

    fn parse(raw: &str) -> UsageResponse {
        parse_usage(serde_json::from_str(raw).expect("fixture parses"))
    }

    #[test]
    fn splits_session_from_weekly() {
        let got = parse(PAYLOAD);

        let session = got.session.expect("session window");
        assert_eq!(session.label, "Session");
        // Passed through, not rescaled: upstream is already a percentage.
        assert_eq!(session.percent, 78.4);
        assert_eq!(
            session.resets_at.map(|d| d.to_rfc3339()),
            Some("2026-09-03T21:00:00+00:00".to_string())
        );

        let labels: Vec<_> = got.weekly.iter().map(|w| w.label.as_str()).collect();
        assert_eq!(labels, ["Week", "Week (Sonnet)"]);
    }

    #[test]
    fn hides_per_model_weekly_off_the_plans_that_meter_it() {
        let raw = PAYLOAD.replace(
            r#""subscription_type": "max""#,
            r#""subscription_type": "pro""#,
        );
        let labels: Vec<_> = parse(&raw)
            .weekly
            .into_iter()
            .map(|w| w.label)
            .collect::<Vec<_>>();
        assert_eq!(labels, ["Week"]);
    }

    #[test]
    fn absent_subscription_type_keeps_per_model_weekly() {
        let raw = PAYLOAD.replace(r#""subscription_type": "max","#, "");
        assert_eq!(parse(&raw).weekly.len(), 2);
    }

    #[test]
    fn null_utilization_drops_the_window_rather_than_reading_as_empty() {
        let raw = PAYLOAD.replace(r#""utilization": 78.4"#, r#""utilization": null"#);
        let got = parse(&raw);
        assert!(got.session.is_none(), "a null figure is not zero usage");
        // The windows that do have figures still come through.
        assert_eq!(got.weekly.len(), 2);
    }

    #[test]
    fn tolerates_a_window_losing_its_reset_stamp() {
        let raw = PAYLOAD.replace(r#", "resets_at": "2026-09-03T21:00:00Z""#, "");
        let session = parse(&raw).session.expect("session survives");
        assert_eq!(session.percent, 78.4);
        assert_eq!(session.resets_at, None);
    }

    #[test]
    fn missing_rate_limits_yields_no_windows() {
        let got = parse(r#"{ "subscription_type": "max" }"#);
        assert_eq!(
            got,
            UsageResponse {
                session: None,
                weekly: Vec::new()
            }
        );
    }

    #[test]
    fn clamps_a_figure_outside_the_scale() {
        let raw = PAYLOAD.replace(r#""utilization": 78.4"#, r#""utilization": 140.0"#);
        assert_eq!(parse(&raw).session.expect("session").percent, 100.0);
    }
}
