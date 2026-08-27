use std::sync::OnceLock;

use sentry_tracing::{EventFilter, SentryLayer};
use tracing::Level;

// Kablan fork: upstream hardcoded Bloop AI's Sentry DSNs here, so an unmodified fork would ship
// its users' crash reports to them. Telemetry is opt-in via KABLAN_SENTRY_DSN; empty = disabled.
const SENTRY_DSN_DEFAULT: &str = "";
const SENTRY_DSN_REMOTE: &str = "";

static INIT_GUARD: OnceLock<sentry::ClientInitGuard> = OnceLock::new();

#[derive(Clone, Copy, Debug)]
pub enum SentrySource {
    Backend,
    Mcp,
    Remote,
}

impl SentrySource {
    fn tag(self) -> &'static str {
        match self {
            SentrySource::Backend => "backend",
            SentrySource::Mcp => "mcp",
            SentrySource::Remote => "remote",
        }
    }

    fn dsn(self) -> String {
        if let Ok(dsn) = std::env::var("KABLAN_SENTRY_DSN") {
            if !dsn.trim().is_empty() {
                return dsn;
            }
        }
        match self {
            SentrySource::Remote => SENTRY_DSN_REMOTE.to_string(),
            _ => SENTRY_DSN_DEFAULT.to_string(),
        }
    }
}

fn environment() -> &'static str {
    if cfg!(debug_assertions) {
        "dev"
    } else {
        "production"
    }
}

pub fn init_once(source: SentrySource) {
    INIT_GUARD.get_or_init(|| {
        sentry::init((
            source.dsn(),
            sentry::ClientOptions {
                release: sentry::release_name!(),
                environment: Some(environment().into()),
                ..Default::default()
            },
        ))
    });

    sentry::configure_scope(|scope| {
        scope.set_tag("source", source.tag());
    });
}

pub fn configure_user_scope(user_id: &str, username: Option<&str>, email: Option<&str>) {
    let mut sentry_user = sentry::User {
        id: Some(user_id.to_string()),
        ..Default::default()
    };

    if let Some(username) = username {
        sentry_user.username = Some(username.to_string());
    }

    if let Some(email) = email {
        sentry_user.email = Some(email.to_string());
    }

    sentry::configure_scope(|scope| {
        scope.set_user(Some(sentry_user));
    });
}

pub fn sentry_layer<S>() -> SentryLayer<S>
where
    S: tracing::Subscriber,
    S: for<'a> tracing_subscriber::registry::LookupSpan<'a>,
{
    SentryLayer::default()
        .span_filter(|meta| {
            matches!(
                *meta.level(),
                Level::DEBUG | Level::INFO | Level::WARN | Level::ERROR
            )
        })
        .event_filter(|meta| match *meta.level() {
            Level::ERROR => EventFilter::Event,
            Level::DEBUG | Level::INFO | Level::WARN => EventFilter::Breadcrumb,
            Level::TRACE => EventFilter::Ignore,
        })
}
