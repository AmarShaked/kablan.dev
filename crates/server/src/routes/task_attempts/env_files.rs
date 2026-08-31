//! A workspace's own environment files.
//!
//! The repository routes edit the .env files in a repo's main checkout, which every worktree
//! copies from — so changing one there changes the checkout you work in too. A worktree is a
//! separate directory with its own copies, and those are what these routes read and write. The
//! repository's copy comes back alongside each file so the client can say whether this task has
//! diverged from it, and offer to put it back.

use std::path::PathBuf;

use axum::{
    Extension, Json,
    extract::{Query, State},
    response::Json as ResponseJson,
};
use db::models::{workspace::Workspace, workspace_repo::WorkspaceRepo};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, routes::repo::ENV_FILE_NAMES};

/// Which of the workspace's repositories to read or write.
///
/// A query parameter rather than a path segment because the workspace middleware above these
/// routes extracts `Path<Uuid>` — a second capture in the path makes that extraction fail for
/// every request to the route, with an error that looks like it comes from the handler.
#[derive(Debug, Deserialize)]
pub struct RepoQuery {
    pub repo_id: Uuid,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct WorkspaceEnvFile {
    pub name: String,
    /// False when this worktree has no such file yet — the UI still offers it, so one can be
    /// created here.
    pub exists: bool,
    pub content: String,
    /// The repository checkout's copy of the same file. The client compares against it to mark a
    /// file as overridden, and offers it as the value to reset back to.
    pub repo_content: String,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct SaveWorkspaceEnvFile {
    pub name: String,
    pub content: String,
}

/// Reading a file that isn't there — or can't be read, because it's a directory or the
/// permissions say no — is reported as absent rather than failing the request. One odd file
/// shouldn't hide the other five.
fn read_or_absent(path: &std::path::Path) -> (bool, String) {
    match std::fs::read_to_string(path) {
        Ok(content) => (true, content),
        Err(_) => (false, String::new()),
    }
}

/// The worktree directory for one of the workspace's repositories.
///
/// Each repository is checked out into its own directory under the workspace, named after it —
/// the same layout the file-copying step writes into. Resolving the repo through the workspace's
/// own list is also what keeps this from reading a repository the task has nothing to do with.
async fn worktree_dir(
    deployment: &DeploymentImpl,
    workspace: &Workspace,
    repo_id: Uuid,
) -> Result<PathBuf, ApiError> {
    let Some(container_ref) = workspace.container_ref.as_ref() else {
        return Err(ApiError::BadRequest(
            "this task has no worktree yet".to_string(),
        ));
    };

    let repos =
        WorkspaceRepo::find_repos_for_workspace(&deployment.db().pool, workspace.id).await?;
    let Some(repo) = repos.into_iter().find(|r| r.id == repo_id) else {
        return Err(ApiError::BadRequest(
            "that repository is not part of this task".to_string(),
        ));
    };

    Ok(PathBuf::from(container_ref).join(&repo.name))
}

/// The repository checkout's copy of the same file, for comparison.
async fn repo_dir(deployment: &DeploymentImpl, repo_id: Uuid) -> Result<PathBuf, ApiError> {
    let repo = deployment
        .repo()
        .get_by_id(&deployment.db().pool, repo_id)
        .await?;
    Ok(repo.path)
}

/// `GET /task-attempts/{id}/env-files?repo_id=…`
pub async fn get_workspace_env_files(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Query(RepoQuery { repo_id }): Query<RepoQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<WorkspaceEnvFile>>>, ApiError> {
    let worktree = worktree_dir(&deployment, &workspace, repo_id).await?;
    let repo_root = repo_dir(&deployment, repo_id).await?;

    let files = ENV_FILE_NAMES
        .iter()
        .map(|name| {
            let (exists, content) = read_or_absent(&worktree.join(name));
            let (_, repo_content) = read_or_absent(&repo_root.join(name));
            WorkspaceEnvFile {
                name: name.to_string(),
                exists,
                content,
                repo_content,
            }
        })
        .collect();

    Ok(ResponseJson(ApiResponse::success(files)))
}

/// `PUT /task-attempts/{id}/env-files?repo_id=…` — write one env file into the worktree.
pub async fn save_workspace_env_file(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Query(RepoQuery { repo_id }): Query<RepoQuery>,
    Json(payload): Json<SaveWorkspaceEnvFile>,
) -> Result<ResponseJson<ApiResponse<WorkspaceEnvFile>>, ApiError> {
    // The filename arrives from the client, and joining an arbitrary one onto the worktree path
    // would let a caller write anywhere on disk. Matching against the allowlist means a traversal
    // attempt simply isn't found.
    if !ENV_FILE_NAMES.contains(&payload.name.as_str()) {
        return Err(ApiError::BadRequest(format!(
            "unsupported env file: {}",
            payload.name
        )));
    }

    let worktree = worktree_dir(&deployment, &workspace, repo_id).await?;
    let repo_root = repo_dir(&deployment, repo_id).await?;

    let path = worktree.join(&payload.name);
    std::fs::write(&path, &payload.content)
        .map_err(|e| ApiError::BadRequest(format!("could not write {}: {e}", payload.name)))?;

    let (_, repo_content) = read_or_absent(&repo_root.join(&payload.name));

    Ok(ResponseJson(ApiResponse::success(WorkspaceEnvFile {
        name: payload.name,
        exists: true,
        content: payload.content,
        repo_content,
    })))
}
