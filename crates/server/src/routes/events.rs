use axum::{
    BoxError, Router,
    extract::{
        State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    response::{
        IntoResponse, Sse,
        sse::{Event, KeepAlive},
    },
    routing::get,
};
use deployment::Deployment;
use futures_util::{SinkExt, StreamExt, TryStreamExt};
use serde_json::json;
use tokio::sync::broadcast::error::RecvError;
use utils::log_msg::LogMsg;

use crate::DeploymentImpl;

pub async fn events(
    State(deployment): State<DeploymentImpl>,
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, BoxError>>>, axum::http::StatusCode>
{
    // Ask the container service for a combined "history + live" stream
    let stream = deployment.stream_events().await;
    Ok(Sse::new(stream.map_err(|e| -> BoxError { e.into() })).keep_alive(KeepAlive::default()))
}

/// Every change, as it happens, to anyone listening.
///
/// The per-view streams (a project's tasks, the projects list, the workspaces) each carry a full
/// snapshot and then the patches for one slice. This carries the patches for all of them and
/// nothing else — no history, no snapshot — because its one reader does not keep state. It is
/// the client's cache, which only needs to know *that* a task or project changed so it can ask
/// again. That is what makes every view live rather than only the one holding a stream: an
/// archived listing, a sidebar count, a cross-project page, all invalidated by the same notice.
///
/// Patches are forwarded untouched, so the client can read the path (`/tasks/<id>`,
/// `/projects/<id>`, …) and decide what to refresh. If the broadcast falls behind, a synthetic
/// patch on `/resync` tells the client to refresh everything rather than miss something.
pub async fn events_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = forward_changes(socket, deployment).await {
            tracing::debug!("changes WS closed: {}", e);
        }
    })
}

async fn forward_changes(socket: WebSocket, deployment: DeploymentImpl) -> anyhow::Result<()> {
    let mut receiver = deployment.events().msg_store().get_receiver();
    let (mut sender, mut client) = socket.split();

    // Drain client frames so pings and pongs keep working.
    tokio::spawn(async move { while let Some(Ok(_)) = client.next().await {} });

    loop {
        let msg = match receiver.recv().await {
            Ok(LogMsg::JsonPatch(patch)) => LogMsg::JsonPatch(patch),
            // Not a change: stdout, ready markers and the like belong to the streams that own them.
            Ok(_) => continue,
            Err(RecvError::Lagged(skipped)) => {
                tracing::warn!(skipped, "changes WS lagged; telling the client to resync");
                let resync = json!([{ "op": "replace", "path": "/resync", "value": true }]);
                LogMsg::JsonPatch(serde_json::from_value(resync)?)
            }
            Err(RecvError::Closed) => break,
        };

        if sender.send(msg.to_ws_message_unchecked()).await.is_err() {
            break; // client went away
        }
    }
    Ok(())
}

pub fn router(_: &DeploymentImpl) -> Router<DeploymentImpl> {
    let events_router = Router::new()
        .route("/", get(events))
        .route("/ws", get(events_ws));

    Router::new().nest("/events", events_router)
}
