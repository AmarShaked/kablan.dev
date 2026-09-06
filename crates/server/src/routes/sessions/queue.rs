use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{delete, get},
};
use db::models::{scratch::DraftFollowUpData, session::Session};
use deployment::Deployment;
use executors::profile::ExecutorProfileId;
use serde::Deserialize;
use services::services::queued_message::QueueStatus;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_session_middleware};

/// Request body for queueing a follow-up message
#[derive(Debug, Deserialize, TS)]
pub struct QueueMessageRequest {
    pub message: String,
    pub executor_profile_id: ExecutorProfileId,
}

/// Queue a follow-up message to be executed when the current execution finishes
async fn queue_message(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<QueueMessageRequest>,
) -> Result<ResponseJson<ApiResponse<QueueStatus>>, ApiError> {
    let data = DraftFollowUpData {
        message: payload.message,
        executor_profile_id: payload.executor_profile_id,
    };

    deployment
        .queued_message_service()
        .queue_message(session.id, data);

    Ok(ResponseJson(ApiResponse::success(
        deployment.queued_message_service().get_status(session.id),
    )))
}

/// Cancel every queued follow-up for this session
async fn cancel_queued_message(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<QueueStatus>>, ApiError> {
    deployment
        .queued_message_service()
        .cancel_queued(session.id);

    Ok(ResponseJson(ApiResponse::success(QueueStatus::Empty)))
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct QueueItemPath {
    session_id: Uuid,
    message_id: Uuid,
}

/// Cancel a single queued follow-up
async fn cancel_queued_message_by_id(
    Extension(session): Extension<Session>,
    Path(QueueItemPath {
        message_id,
        session_id: _,
    }): Path<QueueItemPath>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<QueueStatus>>, ApiError> {
    deployment
        .queued_message_service()
        .cancel_queued_id(session.id, message_id);

    Ok(ResponseJson(ApiResponse::success(
        deployment.queued_message_service().get_status(session.id),
    )))
}

/// Get the current queue status for a session's workspace
async fn get_queue_status(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<QueueStatus>>, ApiError> {
    let status = deployment.queued_message_service().get_status(session.id);
    Ok(ResponseJson(ApiResponse::success(status)))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route(
            "/",
            get(get_queue_status)
                .post(queue_message)
                .delete(cancel_queued_message),
        )
        .route("/{message_id}", delete(cancel_queued_message_by_id))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_session_middleware,
        ))
}
