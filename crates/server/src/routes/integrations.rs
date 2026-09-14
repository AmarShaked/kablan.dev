use axum::{
    Json, Router,
    extract::{Query, State},
    routing::{delete, get, post},
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::{
    config::{IntegrationProvider, LinearConfig, save_config_to_file},
    linear::{
        LinearClient, LinearError, LinearIssueQuery, LinearIssuesResponse, LinearMetaResponse,
        LinearViewer,
    },
};
use ts_rs::TS;
use utils::{assets::config_path, response::ApiResponse};

use crate::{DeploymentImpl, error::ApiError};

pub fn router() -> Router<DeploymentImpl> {
    Router::new().nest(
        "/integrations/linear",
        Router::new()
            .route("/connect", post(connect_linear))
            .route("/issues", get(list_linear_issues))
            .route("/meta", get(linear_meta))
            .route("/", delete(disconnect_linear)),
    )
}

#[derive(Debug, Deserialize, TS)]
pub struct ConnectLinearBody {
    pub api_key: String,
}

#[derive(Debug, Serialize, TS)]
pub struct ConnectLinearResponse {
    pub viewer: LinearViewer,
}

#[derive(Debug, Deserialize)]
pub struct ListLinearIssuesParams {
    pub status: Option<String>,
    pub assignee: Option<String>,
    pub team: Option<String>,
    pub q: Option<String>,
    pub after: Option<String>,
    pub first: Option<u32>,
}

async fn connect_linear(
    State(deployment): State<DeploymentImpl>,
    Json(body): Json<ConnectLinearBody>,
) -> Result<Json<ApiResponse<ConnectLinearResponse>>, ApiError> {
    let api_key = body.api_key.trim().to_string();
    if api_key.is_empty() {
        return Err(ApiError::BadRequest("API key is required".into()));
    }

    let client = LinearClient::new(api_key.clone());
    let viewer = client.validate().await?;

    let config_path = config_path();
    let mut config = deployment.config().read().await.clone();

    config.linear = LinearConfig {
        api_key: Some(api_key),
    };
    if !config
        .enabled_integrations
        .contains(&IntegrationProvider::Linear)
    {
        config
            .enabled_integrations
            .push(IntegrationProvider::Linear);
    }
    if !config
        .connected_integrations
        .contains(&IntegrationProvider::Linear)
    {
        config
            .connected_integrations
            .push(IntegrationProvider::Linear);
    }

    save_config_to_file(&config, &config_path).await?;
    {
        let mut guard = deployment.config().write().await;
        *guard = config;
    }

    Ok(Json(ApiResponse::success(ConnectLinearResponse { viewer })))
}

async fn list_linear_issues(
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<ListLinearIssuesParams>,
) -> Result<Json<ApiResponse<LinearIssuesResponse>>, ApiError> {
    let api_key = {
        let config = deployment.config().read().await;
        config.linear.api_key.clone()
    }
    .ok_or_else(|| ApiError::BadRequest("Linear is not connected".into()))?;

    let client = LinearClient::new(api_key);
    let issues = client
        .list_issues(LinearIssueQuery {
            status: params.status,
            assignee: params.assignee,
            team: params.team,
            q: params.q,
            after: params.after,
            first: params.first,
        })
        .await?;
    Ok(Json(ApiResponse::success(issues)))
}

async fn linear_meta(
    State(deployment): State<DeploymentImpl>,
) -> Result<Json<ApiResponse<LinearMetaResponse>>, ApiError> {
    let api_key = {
        let config = deployment.config().read().await;
        config.linear.api_key.clone()
    }
    .ok_or_else(|| ApiError::BadRequest("Linear is not connected".into()))?;

    let client = LinearClient::new(api_key);
    let meta = client.meta().await?;
    Ok(Json(ApiResponse::success(meta)))
}

async fn disconnect_linear(
    State(deployment): State<DeploymentImpl>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let config_path = config_path();
    let mut config = deployment.config().read().await.clone();

    config.linear = LinearConfig { api_key: None };
    config
        .connected_integrations
        .retain(|p| p != &IntegrationProvider::Linear);
    config
        .enabled_integrations
        .retain(|p| p != &IntegrationProvider::Linear);

    save_config_to_file(&config, &config_path).await?;
    {
        let mut guard = deployment.config().write().await;
        *guard = config;
    }

    Ok(Json(ApiResponse::success(())))
}

impl From<LinearError> for ApiError {
    fn from(value: LinearError) -> Self {
        match value {
            LinearError::Unauthorized => {
                ApiError::BadRequest("Linear rejected that API key".into())
            }
            LinearError::Api(msg) | LinearError::Transport(msg) | LinearError::Unexpected(msg) => {
                ApiError::BadRequest(format!("Linear: {msg}"))
            }
        }
    }
}
