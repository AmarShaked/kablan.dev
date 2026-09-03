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
/// read: the service name could not be established from the CLI binary, and a
/// guessed one fails silently. Those setups go through the environment variable,
/// which `claude setup-token` mints — so the errors below name it rather than
/// leaving an unexplained empty sidebar.
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
             or run `claude setup-token` and set CLAUDE_CODE_OAUTH_TOKEN.",
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
                 or run `claude setup-token` and set CLAUDE_CODE_OAUTH_TOKEN."
                    .to_string(),
            )
        })
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

async fn get_usage() -> Result<ResponseJson<ApiResponse<UsageResponse>>, ApiError> {
    let token = load_token()?;
    let usage = fetch_usage(USAGE_URL, &token).await?;
    Ok(ResponseJson(ApiResponse::success(usage)))
}

/// Fetch one usage payload and map it to the sidebar's shape.
///
/// `url` is a parameter so the tests can stand a local upstream in front of it.
/// It is deliberately *not* configurable at runtime: an override would be a way
/// to point a full-access OAuth token at an arbitrary host.
async fn fetch_usage(url: &str, token: &str) -> Result<UsageResponse, ApiError> {
    let response = reqwest::Client::new()
        .get(url)
        // Bearer, not x-api-key: this is a subscription OAuth token. Headers
        // deliberately mirror the CLI's own request for this endpoint — notably
        // no `anthropic-beta`, which it does not send here.
        .bearer_auth(token)
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

    Ok(parse_usage(upstream))
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

    // -----------------------------------------------------------------------
    // Over real HTTP, against a local stand-in for the upstream. Covers what
    // the fixture tests above cannot: that the request is actually shaped and
    // sent as intended, and that each status maps to the right outcome.
    // -----------------------------------------------------------------------

    use std::sync::{Arc, Mutex};

    use axum::{extract::State, http::HeaderMap, routing::get};

    /// What the stand-in upstream saw, so a test can assert on the request
    /// rather than only on the response.
    #[derive(Clone, Default)]
    struct Seen {
        authorization: Option<String>,
        headers: Vec<String>,
    }

    /// `run.rs` installs a rustls provider for the real server, and reqwest is
    /// built `-no-provider`; the test harness never runs `run.rs`, so without
    /// this every client construction panics with "No provider set".
    fn install_crypto_provider() {
        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| {
            let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
        });
    }

    /// Serve `body` with `status` on a loopback port; returns the URL and a
    /// handle to what the request carried.
    async fn stand_in(status: u16, body: &'static str) -> (String, Arc<Mutex<Seen>>) {
        install_crypto_provider();
        let seen = Arc::new(Mutex::new(Seen::default()));

        let app = axum::Router::new()
            .route(
                "/api/oauth/usage",
                get(
                    async move |State((status, body, seen)): State<(
                        u16,
                        &'static str,
                        Arc<Mutex<Seen>>,
                    )>,
                                headers: HeaderMap| {
                        *seen.lock().expect("lock") = Seen {
                            authorization: headers
                                .get("authorization")
                                .and_then(|v| v.to_str().ok())
                                .map(str::to_string),
                            headers: headers.keys().map(|k| k.as_str().to_string()).collect(),
                        };
                        (
                            axum::http::StatusCode::from_u16(status).expect("status"),
                            [(axum::http::header::CONTENT_TYPE, "application/json")],
                            body,
                        )
                    },
                ),
            )
            .with_state((status, body, Arc::clone(&seen)));

        // Port 0: let the OS pick, so concurrent tests never collide.
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind loopback");
        let addr = listener.local_addr().expect("addr");
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });

        (format!("http://{addr}/api/oauth/usage"), seen)
    }

    #[tokio::test]
    async fn fetches_and_maps_a_live_payload() {
        let (url, seen) = stand_in(200, PAYLOAD).await;

        let got = fetch_usage(&url, "test-token").await.expect("fetch");

        let session = got.session.expect("session window");
        assert_eq!(session.label, "Session");
        assert_eq!(session.percent, 78.4);
        let labels: Vec<_> = got.weekly.iter().map(|w| w.label.as_str()).collect();
        assert_eq!(labels, ["Week", "Week (Sonnet)"]);

        // The token rides as a bearer credential, and no anthropic-beta header
        // goes out — the CLI sends none for this endpoint.
        let seen = seen.lock().expect("lock").clone();
        assert_eq!(seen.authorization.as_deref(), Some("Bearer test-token"));
        assert!(
            !seen.headers.iter().any(|h| h == "anthropic-beta"),
            "unexpected anthropic-beta header: {:?}",
            seen.headers
        );
    }

    #[tokio::test]
    async fn a_401_asks_for_a_refresh_rather_than_reporting_a_shape_problem() {
        let (url, _) = stand_in(401, r#"{"error":"nope"}"#).await;

        let err = fetch_usage(&url, "stale-token")
            .await
            .expect_err("401 is an error");

        let msg = err.to_string();
        assert!(msg.contains("expired"), "unhelpful 401 message: {msg}");
        // The token must not travel in the error text.
        assert!(!msg.contains("stale-token"), "token leaked: {msg}");
    }

    #[tokio::test]
    async fn other_failures_name_the_status() {
        let (url, _) = stand_in(503, "upstream down").await;

        let msg = fetch_usage(&url, "test-token")
            .await
            .expect_err("503 is an error")
            .to_string();
        assert!(msg.contains("503"), "status not surfaced: {msg}");
    }

    #[tokio::test]
    async fn a_shape_change_is_reported_as_one() {
        // 200, but nothing resembling the expected body.
        let (url, _) = stand_in(200, r#"["not","an","object"]"#).await;

        let msg = fetch_usage(&url, "test-token")
            .await
            .expect_err("unparseable body is an error")
            .to_string();
        assert!(
            msg.contains("Unexpected usage response"),
            "shape failure mislabelled: {msg}"
        );
    }

    #[tokio::test]
    async fn an_empty_but_valid_payload_yields_no_windows() {
        // The degrade-gracefully path, end to end rather than in the parser.
        let (url, _) = stand_in(200, r#"{"rate_limits":null}"#).await;

        let got = fetch_usage(&url, "test-token").await.expect("fetch");
        assert!(got.session.is_none());
        assert!(got.weekly.is_empty());
    }
}
