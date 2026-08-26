//! Kablan.dev native backend — HTTP + WebSocket API, behaviorally identical to
//! the original Node/Express server (validated by the shared server test suite).
pub mod agents;
pub mod chat_history;
pub mod config;
pub mod factory;
pub mod git;
pub mod gitlab;
pub mod open;
pub mod processes;
pub mod projects;
pub mod store;

use axum::{
    body::Bytes,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use processes::Processes;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

#[derive(Clone)]
pub struct AppState {
    pub procs: Arc<Processes>,
    pub agents: Arc<agents::Agents>,
}

type ApiResult = Result<Json<Value>, ApiError>;
struct ApiError(StatusCode, String);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}
fn bad(msg: impl Into<String>) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, msg.into())
}

/// Ensure there is room to start one more agent under the concurrency cap. First prunes records
/// whose process already exited (they inflated the count and made "agent limit reached" show up
/// spuriously — clearing after an app restart), then reaps the oldest IDLE agent(s) to free slots.
/// Errors only when every running agent is genuinely busy, so a pile of leftover idle sessions no
/// longer blocks a new one. Reaped agents resume from their persisted session id when reopened.
fn ensure_agent_slot(st: &AppState, cap: usize) -> Result<(), ApiError> {
    st.agents.prune_dead();
    while st.agents.running_count() >= cap {
        if !st.agents.reap_oldest_idle() {
            return Err(bad(
                "agent limit reached — every running agent is busy. Stop one to start a new session.",
            ));
        }
    }
    Ok(())
}
fn server_err(msg: impl Into<String>) -> ApiError {
    ApiError(StatusCode::INTERNAL_SERVER_ERROR, msg.into())
}

fn parse_body(bytes: &Bytes) -> Value {
    if bytes.is_empty() {
        return json!({});
    }
    serde_json::from_slice(bytes).unwrap_or_else(|_| json!({}))
}

async fn blocking<T, F>(f: F) -> T
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f).await.unwrap()
}

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/api/config", get(get_config).put(put_config))
        .route("/api/config/defaults", get(get_defaults))
        .route("/api/config/reset", post(post_reset))
        .route("/api/config/overrides/:name", delete(delete_override))
        .route("/api/projects", get(get_projects))
        .route("/api/projects/:name/branches", get(get_branches))
        .route("/api/projects/:name/worktrees", get(get_worktrees))
        .route("/api/projects/:name/commits", get(get_commits))
        .route("/api/projects/:name/log", get(get_log))
        .route("/api/projects/:name/diff", get(get_diff))
        .route("/api/projects/:name/files", get(get_files))
        .route("/api/projects/:name/deps", get(get_deps))
        .route("/api/projects/:name/open", post(post_open))
        .route("/api/open-url", post(post_open_url))
        .route("/api/projects/:name/checkout", post(post_checkout))
        .route("/api/projects/:name/pull", post(post_pull))
        .route("/api/projects/:name/pull-branch", post(post_pull_branch))
        .route("/api/projects/:name/fetch", post(post_fetch))
        .route("/api/gitlab/hosts", get(get_gitlab_hosts))
        .route("/api/gitlab/token", put(put_gitlab_token).delete(delete_gitlab_token))
        .route("/api/projects/:name/gitlab/overview", get(get_gitlab_overview))
        .route("/api/projects/:name/gitlab/mr", post(post_gitlab_mr))
        .route("/api/inbox", get(get_inbox))
        .route("/api/projects/:name/factory", get(get_factory))
        .route("/api/projects/:name/factory/features", post(post_feature))
        .route("/api/projects/:name/factory/features/:fid", delete(delete_feature_route))
        .route("/api/projects/:name/factory/features/:fid/file", post(post_file_branch))
        .route("/api/projects/:name/factory/features/:fid/unfile", post(post_unfile_branch))
        .route("/api/projects/:name/factory/features/:fid/reorder", post(post_reorder_feature_branches))
        .route("/api/projects/:name/factory/features/reorder", post(post_reorder_features))
        .route("/api/projects/:name/factory/branch/title", post(post_branch_title))
        .route("/api/projects/:name/factory/session", post(post_new_session))
        .route("/api/projects/:name/factory/agent/start", post(post_branch_agent_start))
        .route("/api/projects/:name/factory/agent/message", post(post_branch_agent_message))
        .route("/api/projects/:name/factory/agent/fork", post(post_branch_agent_fork))
        .route("/api/projects/:name/factory/agent/stop", post(post_branch_agent_stop))
        .route("/api/projects/:name/factory/agent/approval", post(post_branch_agent_approval))
        .route("/api/projects/:name/factory/agent", get(get_branch_agent))
        .route("/api/projects/:name/worktrees", post(post_worktree))
        .route("/api/projects/:name/env", get(get_env).put(put_env))
        .route("/api/projects/:name/command", put(put_command))
        .route("/api/servers", get(get_servers))
        .route("/api/projects/:name/server", get(get_project_server))
        .route("/api/projects/:name/logs", get(get_logs))
        .route("/api/projects/:name/server/start", post(post_start))
        .route("/api/projects/:name/server/stop", post(post_stop))
        .route("/ws", get(ws_handler))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

// --- Config ---
async fn get_config() -> ApiResult {
    Ok(Json(serde_json::to_value(config::load()).unwrap()))
}
async fn get_defaults() -> ApiResult {
    Ok(Json(serde_json::to_value(config::AppConfig::default()).unwrap()))
}
async fn put_config(body: Bytes) -> ApiResult {
    let patch = parse_body(&body);
    let cfg = blocking(move || config::save_patch(&patch)).await;
    Ok(Json(serde_json::to_value(cfg).unwrap()))
}
async fn post_reset() -> ApiResult {
    let cfg = blocking(config::reset).await;
    Ok(Json(serde_json::to_value(cfg).unwrap()))
}
async fn delete_override(Path(name): Path<String>) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let cfg = blocking(move || config::clear_override(&dir)).await;
    Ok(Json(serde_json::to_value(cfg).unwrap()))
}

// --- Projects / git ---
async fn get_projects() -> ApiResult {
    let list = blocking(projects::list_projects).await;
    Ok(Json(serde_json::to_value(list).unwrap()))
}
async fn get_branches(Path(name): Path<String>) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let branches = blocking(move || git::list_branches(&dir)).await;
    Ok(Json(serde_json::to_value(branches).unwrap()))
}
async fn get_worktrees(Path(name): Path<String>) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let wts = blocking(move || git::list_worktrees(&dir)).await;
    Ok(Json(serde_json::to_value(wts).unwrap()))
}
async fn get_commits(Path(name): Path<String>, Query(q): Query<HashMap<String, String>>) -> ApiResult {
    let cwd = q.get("cwd").filter(|s| !s.is_empty()).cloned();
    let reff = q.get("ref").filter(|s| !s.is_empty()).cloned();
    let dir = match &cwd {
        Some(c) => {
            let n = name.clone();
            let c = c.clone();
            blocking(move || projects::resolve_workdir(&n, Some(&c))).await.map_err(bad)?
        }
        None => projects::project_path_from_name(&name).map_err(bad)?,
    };
    let ts = blocking(move || git::commit_activity(&dir, reff.as_deref())).await;
    Ok(Json(json!({ "timestamps": ts })))
}
async fn get_log(Path(name): Path<String>, Query(q): Query<HashMap<String, String>>) -> ApiResult {
    let cwd = q.get("cwd").filter(|s| !s.is_empty()).cloned();
    let reff = q.get("ref").filter(|s| !s.is_empty()).cloned();
    let dir = match &cwd {
        Some(c) => {
            let n = name.clone();
            let c = c.clone();
            blocking(move || projects::resolve_workdir(&n, Some(&c))).await.map_err(bad)?
        }
        None => projects::project_path_from_name(&name).map_err(bad)?,
    };
    let limit = q
        .get("limit")
        .and_then(|s| s.parse::<u32>().ok())
        .map(|n| n.clamp(1, 500))
        .unwrap_or(50);
    let commits = blocking(move || git::list_commits(&dir, reff.as_deref(), limit)).await;
    Ok(Json(json!({ "commits": commits })))
}
async fn get_diff(Path(name): Path<String>, Query(q): Query<HashMap<String, String>>) -> ApiResult {
    let cwd = q.get("cwd").filter(|s| !s.is_empty()).cloned();
    let sha = q.get("sha").filter(|s| !s.is_empty()).cloned();
    let against = q.get("against").filter(|s| !s.is_empty()).cloned();
    let dir = match &cwd {
        Some(c) => {
            let n = name.clone();
            let c = c.clone();
            blocking(move || projects::resolve_workdir(&n, Some(&c))).await.map_err(bad)?
        }
        None => projects::project_path_from_name(&name).map_err(bad)?,
    };
    let diff = blocking(move || git::get_diff(&dir, sha.as_deref(), against.as_deref())).await;
    Ok(Json(json!({ "diff": diff })))
}
async fn get_files(Path(name): Path<String>, Query(q): Query<HashMap<String, String>>) -> ApiResult {
    let cwd = q.get("cwd").filter(|s| !s.is_empty()).cloned();
    let dir = match &cwd {
        Some(c) => {
            let n = name.clone();
            let c = c.clone();
            blocking(move || projects::resolve_workdir(&n, Some(&c))).await.map_err(bad)?
        }
        None => projects::project_path_from_name(&name).map_err(bad)?,
    };
    let files = blocking(move || git::list_files(&dir)).await;
    Ok(Json(json!({ "files": files })))
}

/// `GET .../deps?cwd=<workingdir>` — reports dependency presence for a working copy so the UI can
/// block starting a dev server before `node_modules` exists (e.g. right after "New session" while
/// the background copy is still running, or when the user opted out of copying). Tauri-only — NOT
/// mirrored in `server/` (not parity-relevant). `cwd` resolves through the same `resolve_workdir`
/// guard the diff/files endpoints use (default = project main path).
async fn get_deps(Path(name): Path<String>, Query(q): Query<HashMap<String, String>>) -> ApiResult {
    let cwd = q.get("cwd").filter(|s| !s.is_empty()).cloned();
    let dir = match &cwd {
        Some(c) => {
            let n = name.clone();
            let c = c.clone();
            blocking(move || projects::resolve_workdir(&n, Some(&c))).await.map_err(bad)?
        }
        None => projects::project_path_from_name(&name).map_err(bad)?,
    };
    let (has_package_json, has_node_modules) = blocking(move || {
        let root = std::path::Path::new(&dir);
        (root.join("package.json").is_file(), root.join("node_modules").is_dir())
    })
    .await;
    Ok(Json(json!({ "hasPackageJson": has_package_json, "hasNodeModules": has_node_modules })))
}

// --- GitLab ---
async fn get_gitlab_hosts() -> ApiResult {
    let hosts = config::load().gitlab_hosts;
    Ok(Json(json!({ "hosts": hosts })))
}

async fn put_gitlab_token(body: Bytes) -> ApiResult {
    let b = parse_body(&body);
    let host = b.get("host").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase();
    let token = b.get("token").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if host.is_empty() || token.is_empty() {
        return Err(bad("host and token are required"));
    }
    let username = blocking(move || {
        let user = gitlab::validate(&gitlab::api_base(&host), &token)?;
        gitlab::set_token(&host, &token)?;
        config::add_gitlab_host(&host);
        Ok::<String, String>(user)
    })
    .await
    .map_err(bad)?;
    Ok(Json(json!({ "ok": true, "username": username })))
}

async fn delete_gitlab_token(body: Bytes) -> ApiResult {
    let b = parse_body(&body);
    let host = b.get("host").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase();
    if host.is_empty() {
        return Err(bad("host is required"));
    }
    blocking(move || {
        let _ = gitlab::delete_token(&host);
        config::remove_gitlab_host(&host);
    })
    .await;
    Ok(Json(json!({ "ok": true })))
}

async fn get_gitlab_overview(Path(name): Path<String>) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let ov = blocking(move || gitlab::overview(&dir)).await;
    Ok(Json(serde_json::to_value(ov).unwrap()))
}

async fn post_gitlab_mr(Path(name): Path<String>, body: Bytes) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let source = b.get("sourceBranch").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let target = b.get("targetBranch").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let title = b.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if source.is_empty() || target.is_empty() || title.is_empty() {
        return Err(bad("sourceBranch, targetBranch and title are required"));
    }
    let args = gitlab::CreateMrArgs {
        source_branch: source,
        target_branch: target,
        title,
        description: b.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        draft: b.get("draft").and_then(|v| v.as_bool()).unwrap_or(false),
        remove_source_branch: b.get("removeSourceBranch").and_then(|v| v.as_bool()).unwrap_or(false),
    };
    let (iid, web_url) = blocking(move || gitlab::create(&dir, &args)).await.map_err(bad)?;
    Ok(Json(json!({ "iid": iid, "webUrl": web_url })))
}

// --- Agent Factory ---
fn factory_store_path() -> std::path::PathBuf {
    config::config_dir().join("factory.json")
}

async fn get_factory(State(st): State<AppState>, Path(name): Path<String>) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let key = name.clone();
    let agents = st.agents.clone();
    let out = blocking(move || {
        let path = factory_store_path();
        let mut file = factory::load_file(&path);
        // Reconcile-on-read (BY WORKTREE PATH): heal any session whose worktree was
        // checked out onto a new branch (e.g. the agent ran `git checkout -b …`), so
        // the returned factory — and the live agent registry — are already correct and
        // one session can't show up as two branches. See
        // `factory::reconcile_project_worktrees`.
        let mut path_to_branch: std::collections::BTreeMap<String, String> = std::collections::BTreeMap::new();
        for w in git::list_worktrees(&dir) {
            if let Some(branch) = w.branch {
                path_to_branch.insert(w.path, branch);
            }
        }
        let rekeys = factory::reconcile_project_worktrees(&mut file, &key, &path_to_branch);
        if !rekeys.is_empty() {
            for (old_key, new_key) in &rekeys {
                agents.rekey(old_key, new_key);
            }
            let _ = factory::save_file(&path, &file);
        }
        let pf = file.projects.get(&key).cloned().unwrap_or_default();
        json!({ "features": pf.features, "branchState": pf.branch_state })
    })
    .await;
    Ok(Json(out))
}

async fn post_feature(Path(name): Path<String>, body: Bytes) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let fname = b.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let key = name.clone();
    let feat = blocking(move || {
        let path = factory_store_path();
        let mut file = factory::load_file(&path);
        let feat = factory::create_feature(&mut file, &key, &fname)?;
        factory::save_file(&path, &file)?;
        Ok::<_, String>(feat)
    })
    .await
    .map_err(bad)?;
    Ok(Json(serde_json::to_value(feat).unwrap()))
}

async fn delete_feature_route(Path((name, fid)): Path<(String, String)>) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let key = name.clone();
    blocking(move || {
        let path = factory_store_path();
        let mut file = factory::load_file(&path);
        factory::delete_feature(&mut file, &key, &fid)?;
        factory::save_file(&path, &file)?;
        Ok::<_, String>(())
    })
    .await
    .map_err(bad)?;
    Ok(Json(json!({ "ok": true })))
}

async fn post_file_branch(Path((name, fid)): Path<(String, String)>, body: Bytes) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let branch = b.get("branch").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let key = name.clone();
    blocking(move || {
        let path = factory_store_path();
        let mut file = factory::load_file(&path);
        factory::file_branch(&mut file, &key, &fid, &branch)?;
        factory::save_file(&path, &file)?;
        Ok::<_, String>(())
    })
    .await
    .map_err(bad)?;
    Ok(Json(json!({ "ok": true })))
}

async fn post_unfile_branch(Path((name, fid)): Path<(String, String)>, body: Bytes) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let branch = b.get("branch").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let key = name.clone();
    blocking(move || {
        let path = factory_store_path();
        let mut file = factory::load_file(&path);
        factory::unfile_branch(&mut file, &key, &fid, &branch)?;
        factory::save_file(&path, &file)?;
        Ok::<_, String>(())
    })
    .await
    .map_err(bad)?;
    Ok(Json(json!({ "ok": true })))
}

/// `POST .../factory/branch/title` — set (or clear) a branch's friendly display title.
/// Body: `{ branch, title }`. An empty/whitespace `title` clears it back to the raw branch
/// name (the branch itself is never renamed — the title is display-only metadata).
async fn post_branch_title(Path(name): Path<String>, body: Bytes) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let branch = b.get("branch").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    if branch.is_empty() {
        return Err(bad("branch is required".to_string()));
    }
    let title = b.get("title").and_then(|v| v.as_str()).map(str::to_string);
    let key = name.clone();
    blocking(move || {
        let path = factory_store_path();
        let mut file = factory::load_file(&path);
        factory::set_branch_title(&mut file, &key, &branch, title);
        factory::save_file(&path, &file)?;
        Ok::<_, String>(())
    })
    .await
    .map_err(bad)?;
    Ok(Json(json!({ "ok": true })))
}

/// Parses a JSON array of strings from `body[field]`, tolerating a missing/wrong-typed field
/// as an empty list (the store-layer permutation check then reports the real error).
fn string_array(b: &Value, field: &str) -> Vec<String> {
    b.get(field)
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or_default()
}

async fn post_reorder_feature_branches(Path((name, fid)): Path<(String, String)>, body: Bytes) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let branches = string_array(&b, "branches");
    let key = name.clone();
    blocking(move || {
        let path = factory_store_path();
        let mut file = factory::load_file(&path);
        factory::reorder_feature_branches(&mut file, &key, &fid, branches)?;
        factory::save_file(&path, &file)?;
        Ok::<_, String>(())
    })
    .await
    .map_err(bad)?;
    Ok(Json(json!({ "ok": true })))
}

async fn post_reorder_features(Path(name): Path<String>, body: Bytes) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let order = string_array(&b, "order");
    let key = name.clone();
    blocking(move || {
        let path = factory_store_path();
        let mut file = factory::load_file(&path);
        factory::reorder_features(&mut file, &key, order)?;
        factory::save_file(&path, &file)?;
        Ok::<_, String>(())
    })
    .await
    .map_err(bad)?;
    Ok(Json(json!({ "ok": true })))
}

/// Registry/WS key for a branch's owned agent. Branch names contain `/`, so
/// they never appear as a path segment — always body/query — but they're
/// safe to fold into this key since it's never itself used as a URL path.
fn branch_agent_key(name: &str, branch: &str) -> String {
    format!("{name}::branch:{branch}")
}

/// Split a branch-agent key (`{project}::branch:{branch}`) back into its parts.
/// Uses the first `::branch:` so a branch name that itself contains `::branch:`
/// (unlikely, but git allows odd refs) stays intact on the branch side.
fn parse_branch_agent_key(key: &str) -> Option<(&str, &str)> {
    key.split_once("::branch:")
}

/// Persist an agent's Claude session id into the factory store so a later app
/// restart can `--resume` the same conversation. Called from the agent stream
/// reader the instant a session id is first captured.
///
/// Why here and not only in `get_branch_agent`: that poll path persists the id
/// lazily, but the UI skips its backfill poll whenever the agent is live — so a
/// brand-new session that streams start-to-finish (and is never polled before the
/// app closes) would never record its id and would lose all context on restart.
/// This hook closes that gap. Idempotent (only writes when nothing is stored yet)
/// and best-effort (never panics/propagates). Runs on the reader thread, so the
/// blocking file I/O is fine — it does not touch the async runtime.
pub(crate) fn persist_branch_session_id(key: &str, session_id: &str) {
    let Some((name, branch)) = parse_branch_agent_key(key) else { return };
    let path = factory_store_path();
    let mut file = factory::load_file(&path);
    let needs_persist = factory::get_branch_state(&file, name, branch)
        .map(|s| s.agent_session_id.is_none())
        .unwrap_or(true);
    if needs_persist {
        factory::set_branch_session(&mut file, name, branch, session_id);
        let _ = factory::save_file(&path, &file);
    }
}

/// Shared start logic for `POST .../factory/agent/start`. Ensures the
/// branch's working copy exists (reusing it if the branch is already
/// checked out elsewhere), persists it, resumes from any stored session id,
/// enforces the concurrent-agent limit, and starts the process.
async fn start_branch_agent(
    st: &AppState,
    name: &str,
    branch: &str,
    copy_node_modules: bool,
    copy_env: bool,
    model: Option<String>,
    permission_mode: Option<String>,
    // Fork a resumed session AT this message uuid (`--resume-session-at`) — the chat EDIT / RETRY
    // path. Only honored when `fresh` is false and a session id is on record.
    resume_at: Option<String>,
    // Start a brand-new conversation: ignore (and forget) any persisted session id, so nothing is
    // resumed. The chat RESET path. Overrides `resume_at`.
    fresh: bool,
) -> Result<agents::AgentView, ApiError> {
    let dir = projects::project_path_from_name(name).map_err(bad)?;
    let mut cfg = config::load();
    // Per-branch model override (from the cockpit's model dropdown). Empty string = "Default"
    // (use the configured/global model). Applied by overriding the factory model for THIS start
    // only — `agents.start` stops any running agent first, so changing the model restarts the
    // agent, resuming its persisted session id to keep the conversation.
    if let Some(m) = model {
        if !m.trim().is_empty() {
            cfg.factory.agent_model = m.trim().to_string();
        }
    }
    // Per-branch permission-mode override (from the cockpit's Permission dropdown), applied the
    // same way as the model override. `build_agent_argv` emits `--permission-mode <mode>`, so a
    // Bypass selection lets tool calls auto-proceed instead of stalling on prompts.
    if let Some(pm) = permission_mode {
        if !pm.trim().is_empty() {
            cfg.factory.permission_mode = pm.trim().to_string();
        }
    }
    // Soft cap: prunes dead records and reaps idle agents to make room, erroring only if every
    // agent is genuinely busy. TODO: still checked-then-acted-on without a lock held across the
    // later `agents.start()`, so concurrent starts can race past the limit (small TOCTOU window).
    ensure_agent_slot(st, cfg.factory.max_concurrent_agents as usize)?;
    let name2 = name.to_string();
    let branch2 = branch.to_string();
    let cfg2 = cfg.clone();
    let (worktree_path, session_id) = blocking(move || {
        let wt_root = if cfg2.factory.worktree_root.trim().is_empty() {
            config::config_dir().join("worktrees")
        } else {
            std::path::PathBuf::from(cfg2.factory.worktree_root.trim())
        };
        let wt = git::ensure_worktree_for_branch(std::path::Path::new(&dir), &wt_root, &name2, &branch2)?;
        let path = factory_store_path();
        let mut file = factory::load_file(&path);
        factory::set_branch_worktree(&mut file, &name2, &branch2, &wt.path);
        // RESET forgets the persisted session so a brand-new conversation starts (and its fresh
        // session id is captured on the next poll). Otherwise resume the stored session id.
        let session_id = if fresh {
            factory::clear_branch_session(&mut file, &name2, &branch2);
            None
        } else {
            factory::get_branch_state(&file, &name2, &branch2).and_then(|s| s.agent_session_id.clone())
        };
        factory::save_file(&path, &file)?;
        // Seed the worktree with node_modules/.env from the project's main working copy so it can
        // build/run immediately (a fresh worktree has neither — both gitignored). Gated by the
        // caller's opt-out flags (defaults on in the UI). Idempotent (see copy_session_extras): a
        // no-op when the worktree already has them (branch reused). For a divergent branch whose
        // deps differ, the details card's "Install deps" is the fix-up.
        copy_session_extras(
            std::path::Path::new(&dir),
            std::path::Path::new(&wt.path),
            copy_node_modules,
            copy_env,
        );
        Ok::<_, String>((wt.path, session_id))
    })
    .await
    .map_err(bad)?;

    let key = branch_agent_key(name, branch);
    // `resume_at` is only meaningful when resuming a session (see build_agent_argv); when `fresh`
    // cleared the session id it's dropped automatically since `session_id` is None.
    let argv = agents::build_agent_argv(&cfg.factory, session_id.as_deref(), resume_at.as_deref());
    let view = st.agents.start(&key, &worktree_path, argv, session_id.as_deref());
    Ok(view)
}

fn branch_from_body(b: &Value) -> Result<String, ApiError> {
    match b.get("branch").and_then(|v| v.as_str()).map(str::trim) {
        Some(s) if !s.is_empty() => Ok(s.to_string()),
        _ => Err(bad("branch is required")),
    }
}

async fn post_branch_agent_start(State(st): State<AppState>, Path(name): Path<String>, body: Bytes) -> ApiResult {
    let b = parse_body(&body);
    let branch = branch_from_body(&b)?;
    // Seed a freshly-created worktree with the project's dev assets. Default on (the common case is
    // "just run it"); the "Start working" UI passes false to opt out per-branch. No-op on an
    // already-seeded worktree (copy_session_extras is idempotent).
    let copy_node_modules = b.get("copyNodeModules").and_then(|v| v.as_bool()).unwrap_or(true);
    let copy_env = b.get("copyEnv").and_then(|v| v.as_bool()).unwrap_or(true);
    let model = b.get("model").and_then(|v| v.as_str()).map(str::to_string);
    let permission_mode = b.get("permissionMode").and_then(|v| v.as_str()).map(str::to_string);
    let view = start_branch_agent(&st, &name, &branch, copy_node_modules, copy_env, model, permission_mode, None, false).await?;
    Ok(Json(serde_json::to_value(view).unwrap()))
}

/// `POST .../factory/agent/fork` — the chat EDIT / RETRY / RESET actions. Restarts the branch's
/// agent resuming its Claude session and (optionally) re-sending an edited turn:
///
/// - Body `{ branch, messageUuid, text, images? }` — EDIT / RETRY: stop the agent, relaunch with
///   `--resume <sid> --resume-session-at <messageUuid>` (forking history at the final assistant
///   uuid of the turn BEFORE the one being replaced), then deliver `text` as the new turn. Earlier
///   context is kept; the replaced turn and everything after it is dropped.
/// - `messageUuid` absent (editing the very first turn — no preceding assistant): start a fresh
///   session and deliver `text`.
/// - Body `{ branch, reset: true }` — RESET: forget the session id and start a brand-new
///   conversation; no message is sent.
///
/// The session id is preserved across an EDIT/RETRY fork (no `--fork-session`), so the persisted
/// `agent_session_id` stays valid. Verified against Claude Code 2.1.x.
async fn post_branch_agent_fork(State(st): State<AppState>, Path(name): Path<String>, body: Bytes) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let branch = branch_from_body(&b)?;
    let reset = b.get("reset").and_then(|v| v.as_bool()).unwrap_or(false);
    let message_uuid = b
        .get("messageUuid")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let text = b.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let images = parse_message_images(&b);
    let model = b.get("model").and_then(|v| v.as_str()).map(str::to_string);
    let permission_mode = b.get("permissionMode").and_then(|v| v.as_str()).map(str::to_string);

    // A fork with no fork point (RESET, or editing the first turn) starts fresh; otherwise it
    // resumes the session AT the given uuid.
    let fresh = reset || message_uuid.is_none();
    let resume_at = if fresh { None } else { message_uuid };
    // The worktree already exists for a session being forked, so don't reseed dev assets.
    let view = start_branch_agent(&st, &name, &branch, false, false, model, permission_mode, resume_at, fresh).await?;

    // RESET just restarts the conversation; EDIT/RETRY (and first-turn edit) deliver the new turn.
    let key = branch_agent_key(&name, &branch);
    let sent = if !reset && (!text.is_empty() || !images.is_empty()) {
        st.agents.send(&key, &text, &images)
    } else {
        false
    };
    Ok(Json(json!({ "ok": true, "sent": sent, "agent": view })))
}

/// Short, effectively-unique branch suffix for the "New session" flow — the
/// low 32 bits of the current time in nanoseconds, formatted as hex. Mirrors
/// the id-generation convention `factory::create_task_force` used to follow
/// before the branch-centric rewrite (see `git.rs`'s `add_worktree_for_branch`
/// doc comment): short, monotonic-ish, and collision-proof in practice for a
/// single user clicking "New session" — a true collision would just surface
/// as a "branch already exists" git error on the next click.
/// Turn a user-typed New-session branch name into a valid, tidy git branch name, or None if
/// nothing usable remains (→ caller falls back to the auto `session/<hex>` name). Lowercases,
/// turns any run of unsupported characters (spaces included) into a single `-`, keeps
/// `a-z 0-9 - _ / .`, and strips leading/trailing separators plus git-forbidden `..` sequences.
/// Anything still invalid is caught later by `git worktree add` and surfaced as an error.
fn sanitize_branch_name(raw: &str) -> Option<String> {
    let mut out = String::new();
    let mut prev_sep = true; // true so a leading separator run is dropped
    for ch in raw.trim().chars() {
        let c = ch.to_ascii_lowercase();
        if c.is_ascii_alphanumeric() || matches!(c, '_' | '/' | '.') {
            out.push(c);
            prev_sep = false;
        } else if !prev_sep {
            out.push('-');
            prev_sep = true;
        }
    }
    while out.contains("..") {
        out = out.replace("..", ".");
    }
    let trimmed = out.trim_matches(|c| matches!(c, '-' | '.' | '/' | '_')).to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn generate_session_branch() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("session/{:x}", (nanos & 0xffff_ffff) as u32)
}

/// Seed a fresh worktree with the project's gitignored dev assets (node_modules / .env) copied
/// from its main working copy, so a new session can build/run right away. On macOS uses
/// copy-on-write (`cp -cR`) so cloning a large node_modules is near-instant on APFS; elsewhere a
/// plain recursive copy. Best-effort: a missing source (or a failed copy) is silently skipped —
/// it must never fail session creation.
fn copy_session_extras(src_root: &std::path::Path, worktree: &std::path::Path, node_modules: bool, env_file: bool) {
    #[cfg(target_os = "macos")]
    const DIR_FLAGS: &[&str] = &["-cR"];
    #[cfg(not(target_os = "macos"))]
    const DIR_FLAGS: &[&str] = &["-R"];

    if node_modules {
        let src = src_root.join("node_modules");
        let dst = worktree.join("node_modules");
        // Skip if the worktree already has node_modules — both to avoid clobbering a copy the
        // user manages and because `cp src dst` copies *into* an existing dst dir (wrong shape).
        // This makes the copy idempotent, so it's safe on a reused worktree (`Start working`).
        if src.is_dir() && !dst.exists() {
            let _ = std::process::Command::new("cp")
                .args(DIR_FLAGS)
                .arg("--")
                .arg(&src)
                .arg(&dst)
                .status();
        }
    }
    if env_file {
        let src = src_root.join(".env");
        let dst = worktree.join(".env");
        if src.is_file() && !dst.exists() {
            let _ = std::fs::copy(&src, &dst);
        }
    }
}

/// `POST .../factory/session` — the "New session" flow: unlike
/// `factory/agent/start` (which starts an agent on a branch the user already
/// picked), this lets the user pick only a BASE branch to branch off.
/// Generates a fresh `session/<hex>` branch name, forges a worktree for it
/// off `baseBranch`, starts its agent, and (if `message` is given) delivers
/// it as the first message — all before the caller ever names a branch.
async fn post_new_session(State(st): State<AppState>, Path(name): Path<String>, body: Bytes) -> ApiResult {
    let b = parse_body(&body);
    let base_branch = match b.get("baseBranch").and_then(|v| v.as_str()).map(str::trim) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return Err(bad("baseBranch is required")),
    };
    let message = b
        .get("message")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    // Optional images pasted/dropped into the New-session composer, delivered with the first turn.
    let images = parse_message_images(&b);
    // Optionally seed the fresh worktree with the project's gitignored dev assets so it can build/
    // run immediately (a new worktree has neither, since both are gitignored).
    let copy_node_modules = b.get("copyNodeModules").and_then(|v| v.as_bool()).unwrap_or(false);
    let copy_env = b.get("copyEnv").and_then(|v| v.as_bool()).unwrap_or(false);
    // Optional per-session permission mode chosen in the New-session dialog — applied as a launch
    // override when building the agent argv below (mirrors `start_branch_agent`'s override).
    let permission_mode = b.get("permissionMode").and_then(|v| v.as_str()).map(str::to_string);

    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let cfg = config::load();
    // Same soft (TOCTOU-able) cap as `start_branch_agent` — prunes dead + reaps idle to make room.
    ensure_agent_slot(&st, cfg.factory.max_concurrent_agents as usize)?;

    // Optional user-chosen branch name from the New-session dialog; sanitized to a valid git ref.
    // Empty/all-invalid falls back to the auto `session/<hex>` name. A name that already exists is
    // rejected up front so the user can pick another (rather than a cryptic worktree-add failure).
    let new_branch = match b.get("branch").and_then(|v| v.as_str()).and_then(sanitize_branch_name) {
        Some(chosen) => {
            if git::local_branch_exists(&dir, &chosen) {
                return Err(bad(format!("branch \"{chosen}\" already exists — pick another name")));
            }
            chosen
        }
        None => generate_session_branch(),
    };
    let name2 = name.clone();
    let branch2 = new_branch.clone();
    let cfg2 = cfg.clone();
    // Source root for the deferred dev-asset copy below (the blocking closure moves `dir`).
    let src_root = dir.clone();
    // Create the worktree + persist the factory state (fast) and RETURN the worktree path — the
    // node_modules/.env copy is deliberately NOT done here. That copy can be large and slow, and the
    // agent doesn't need it to start (only a dev server does; "Install deps" is the fallback), so it
    // runs in a detached background thread AFTER this returns — the HTTP response, and thus the
    // cockpit, no longer waits on it.
    let worktree_path = blocking(move || {
        let wt_root = if cfg2.factory.worktree_root.trim().is_empty() {
            config::config_dir().join("worktrees")
        } else {
            std::path::PathBuf::from(cfg2.factory.worktree_root.trim())
        };
        let wt = git::create_worktree_new_branch(std::path::Path::new(&dir), &wt_root, &name2, &branch2, &base_branch)?;
        let path = factory_store_path();
        let mut file = factory::load_file(&path);
        factory::set_branch_worktree(&mut file, &name2, &branch2, &wt.path);
        factory::save_file(&path, &file)?;
        Ok::<_, String>(wt.path)
    })
    .await
    .map_err(bad)?;

    // Deferred, best-effort dev-asset copy on a detached thread that owns its own PathBufs (so it
    // outlives this handler). Runs concurrently with the agent start below — deps aren't needed to
    // start the agent, and copy_session_extras is idempotent/self-skipping if the assets are absent.
    if copy_node_modules || copy_env {
        let copy_src = std::path::PathBuf::from(&src_root);
        let copy_dst = std::path::PathBuf::from(&worktree_path);
        std::thread::spawn(move || {
            copy_session_extras(&copy_src, &copy_dst, copy_node_modules, copy_env);
        });
    }

    let key = branch_agent_key(&name, &new_branch);
    // Apply the New-session permission override (if any) to a cloned config for this launch only —
    // `build_agent_argv` emits `--permission-mode <mode>`, so e.g. a Bypass selection auto-proceeds.
    let mut cfg_run = cfg.clone();
    if let Some(pm) = permission_mode {
        if !pm.trim().is_empty() {
            cfg_run.factory.permission_mode = pm.trim().to_string();
        }
    }
    let argv = agents::build_agent_argv(&cfg_run.factory, None, None);
    let _ = st.agents.start(&key, &worktree_path, argv, None);
    // Deliver the first turn when there's a message and/or at least one image (agents.send renders
    // the image content blocks). A turn with images but no text is valid.
    if message.is_some() || !images.is_empty() {
        let text = message.unwrap_or_default();
        st.agents.send(&key, &text, &images);
    }

    Ok(Json(json!({ "branch": new_branch })))
}

/// Parse an optional `images` array — `[{ mediaType, data }]` (base64) — from a message body into
/// the `(media_type, base64)` pairs `agents.send` expects. Silently drops malformed entries.
fn parse_message_images(b: &Value) -> Vec<(String, String)> {
    b.get("images")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|img| {
                    let mt = img.get("mediaType").and_then(|v| v.as_str())?;
                    let data = img.get("data").and_then(|v| v.as_str())?;
                    if mt.is_empty() || data.is_empty() {
                        return None;
                    }
                    Some((mt.to_string(), data.to_string()))
                })
                .collect()
        })
        .unwrap_or_default()
}

async fn post_branch_agent_message(State(st): State<AppState>, Path(name): Path<String>, body: Bytes) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let branch = branch_from_body(&b)?;
    let text = b.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let images = parse_message_images(&b);
    // A turn needs at least text or one image.
    if text.is_empty() && images.is_empty() {
        return Err(bad("text or an image is required"));
    }
    let key = branch_agent_key(&name, &branch);
    let ok = st.agents.send(&key, &text, &images);
    Ok(Json(json!({ "ok": ok })))
}

async fn post_branch_agent_stop(State(st): State<AppState>, Path(name): Path<String>, body: Bytes) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let branch = branch_from_body(&b)?;
    let key = branch_agent_key(&name, &branch);
    let ok = st.agents.stop(&key);
    Ok(Json(json!({ "ok": ok })))
}

/// `POST .../factory/agent/approval` — resolve a pending per-tool approval (supervised mode).
/// Body: `{ branch, approvalId, decision: "allow"|"deny", reason? }`. Writes the correlated
/// control_response to the agent over stdio and returns `{ ok }` (false if the approval was
/// unknown / the agent's stdin was gone).
async fn post_branch_agent_approval(State(st): State<AppState>, Path(name): Path<String>, body: Bytes) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let branch = branch_from_body(&b)?;
    let approval_id = match b.get("approvalId").and_then(|v| v.as_str()).map(str::trim) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return Err(bad("approvalId is required")),
    };
    let decision = match b.get("decision").and_then(|v| v.as_str()) {
        Some(d @ ("allow" | "deny")) => d.to_string(),
        _ => return Err(bad("decision must be \"allow\" or \"deny\"")),
    };
    let reason = b.get("reason").and_then(|v| v.as_str()).map(str::to_string);
    let key = branch_agent_key(&name, &branch);
    let ok = st.agents.resolve_approval(&key, &approval_id, &decision, reason.as_deref());
    Ok(Json(json!({ "ok": ok })))
}

async fn get_branch_agent(State(st): State<AppState>, Path(name): Path<String>, Query(q): Query<HashMap<String, String>>) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let branch = match q.get("branch").filter(|s| !s.is_empty()) {
        Some(s) => s.clone(),
        None => return Err(bad("branch is required")),
    };
    let key = branch_agent_key(&name, &branch);
    let agent = st.agents.get(&key);
    // In-memory events are the source of truth while an agent is live this
    // session (they already include everything streamed so far). When the
    // registry has none (fresh app start, or a reopened/restarted branch),
    // fall back to the persisted transcript on disk so the UI backfill shows
    // history instead of an empty pane.
    let mut events = st.agents.events(&key);
    if events.is_empty() {
        let key2 = key.clone();
        events = blocking(move || chat_history::load_events(&key2)).await;
    }

    // Lightweight reconcile: the session id arrives asynchronously via the
    // agent's stream, so persist it into the store the first time a
    // reconnecting UI polls and finds one we haven't recorded yet.
    if let Some(sid) = agent.as_ref().and_then(|a| a.session_id.clone()) {
        let name2 = name.clone();
        let branch2 = branch.clone();
        blocking(move || {
            let path = factory_store_path();
            let mut file = factory::load_file(&path);
            let needs_persist = factory::get_branch_state(&file, &name2, &branch2)
                .map(|s| s.agent_session_id.is_none())
                .unwrap_or(true);
            if needs_persist {
                factory::set_branch_session(&mut file, &name2, &branch2, &sid);
                let _ = factory::save_file(&path, &file);
            }
        })
        .await;
    }

    // Backfill outstanding per-tool approvals (supervised mode) so a reconnecting client
    // re-renders the open Approve/Deny gates instead of losing them.
    let approvals = st.agents.pending_approvals(&key);
    Ok(Json(json!({ "agent": agent, "events": events, "approvals": approvals })))
}

async fn get_inbox(State(st): State<AppState>) -> ApiResult {
    let statuses: std::collections::BTreeMap<String, agents::AgentStatus> =
        st.agents.get_all().into_iter().map(|v| (v.key, v.status)).collect();
    let out = blocking(move || {
        let file = factory::load_file(&factory_store_path());
        factory::build_inbox(&file, &statuses)
    }).await;
    Ok(Json(serde_json::to_value(out).unwrap()))
}

async fn post_worktree(Path(name): Path<String>, body: Bytes) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let branch = match b.get("branch").and_then(|v| v.as_str()).map(str::trim) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return Err(bad("branch is required")),
    };
    let key = name.clone();
    let wt = blocking(move || {
        let cfg = config::load();
        let wt_root = if cfg.factory.worktree_root.trim().is_empty() {
            config::config_dir().join("worktrees")
        } else {
            std::path::PathBuf::from(cfg.factory.worktree_root.trim())
        };
        git::add_worktree_for_branch(std::path::Path::new(&dir), &wt_root, &key, &branch)
    })
    .await
    .map_err(bad)?;
    Ok(Json(serde_json::to_value(wt).unwrap()))
}

async fn post_open(Path(name): Path<String>, body: Bytes) -> ApiResult {
    let b = parse_body(&body);
    let target = b.get("target").and_then(|v| v.as_str()).unwrap_or("");
    let valid = ["vscode", "cursor", "terminal", "iterm", "finder", "url"];
    if !valid.contains(&target) {
        return Err(bad("invalid target"));
    }
    let arg = if target == "url" {
        b.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string()
    } else {
        let cwd = b.get("cwd").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from);
        let n = name.clone();
        blocking(move || projects::resolve_workdir(&n, cwd.as_deref())).await.map_err(bad)?
    };
    if arg.is_empty() {
        return Err(bad("missing url/cwd"));
    }
    let target = target.to_string();
    blocking(move || open::open_target(&target, &arg)).await.map_err(bad)?;
    Ok(Json(json!({ "ok": true })))
}
/// Hand a web URL to the OS browser. The desktop shell needs this: inside the webview an
/// `<a target="_blank">` (or `window.open`) is a silent no-op, so link clicks did nothing.
/// Project-independent — unlike `post_open`, there's no working copy involved.
async fn post_open_url(body: Bytes) -> ApiResult {
    let b = parse_body(&body);
    let url = b.get("url").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    if url.is_empty() {
        return Err(bad("missing url"));
    }
    // Scheme allowlist: transcripts render agent/tool-authored markdown, so only ever hand the
    // OS a web or mail link — never file://, a custom scheme, or a shell-ish argument.
    let allowed = ["http://", "https://", "mailto:"].iter().any(|p| url.starts_with(p));
    if !allowed {
        return Err(bad("unsupported url scheme"));
    }
    blocking(move || open::open_target("url", &url)).await.map_err(bad)?;
    Ok(Json(json!({ "ok": true })))
}

async fn post_checkout(Path(name): Path<String>, body: Bytes) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let branch = match b.get("branch").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return Err(bad("branch is required")),
    };
    let dir2 = dir.clone();
    let br = branch.clone();
    blocking(move || git::checkout(&dir2, &br)).await.map_err(bad)?;
    let current = blocking(move || git::current_branch(&dir)).await;
    Ok(Json(json!({ "currentBranch": current })))
}
async fn post_pull(Path(name): Path<String>) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let dir2 = dir.clone();
    let output = blocking(move || git::pull(&dir2)).await.map_err(bad)?;
    let current = blocking(move || git::current_branch(&dir)).await;
    Ok(Json(json!({ "output": output, "currentBranch": current })))
}
async fn post_pull_branch(Path(name): Path<String>, body: Bytes) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let branch = match b.get("branch").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return Err(bad("branch is required")),
    };
    let workdir = match b.get("cwd").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
        Some(c) => {
            let n = name.clone();
            let c = c.to_string();
            Some(blocking(move || projects::resolve_workdir(&n, Some(&c))).await.map_err(bad)?)
        }
        None => None,
    };
    let output = blocking(move || git::pull_branch(&dir, &branch, workdir.as_deref())).await.map_err(bad)?;
    Ok(Json(json!({ "output": output })))
}

async fn post_fetch(Path(name): Path<String>) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let output = blocking(move || git::fetch_remotes(&dir)).await.map_err(bad)?;
    Ok(Json(json!({ "output": output })))
}

// --- Env files ---
async fn get_env(Path(name): Path<String>, Query(q): Query<HashMap<String, String>>) -> ApiResult {
    let cwd = q.get("cwd").filter(|s| !s.is_empty()).cloned();
    let n = name.clone();
    let dir = blocking(move || projects::resolve_workdir(&n, cwd.as_deref())).await.map_err(bad)?;
    let files = blocking(move || projects::read_env_files(&dir)).await;
    Ok(Json(serde_json::to_value(files).unwrap()))
}
async fn put_env(Path(name): Path<String>, body: Bytes) -> ApiResult {
    let b = parse_body(&body);
    let cwd = b.get("cwd").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from);
    let n = name.clone();
    let dir = blocking(move || projects::resolve_workdir(&n, cwd.as_deref())).await.map_err(bad)?;
    let file = b.get("name").and_then(|v| v.as_str());
    let content = b.get("content").and_then(|v| v.as_str());
    let (file, content) = match (file, content) {
        (Some(f), Some(c)) => (f.to_string(), c.to_string()),
        _ => return Err(bad("name and content are required")),
    };
    blocking(move || projects::write_env_file(&dir, &file, &content)).await.map_err(bad)?;
    Ok(Json(json!({ "ok": true })))
}

// --- Dev command override ---
async fn put_command(Path(name): Path<String>, body: Bytes) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let dev = b.get("devCommand").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let dir2 = dir.clone();
    blocking(move || config::set_override(&dir2, Some(dev))).await;
    let resolved = blocking(move || projects::resolve_dev_command(std::path::Path::new(&dir))).await;
    Ok(Json(json!({ "devCommand": resolved })))
}

// --- Servers ---
async fn get_servers(State(st): State<AppState>) -> ApiResult {
    Ok(Json(serde_json::to_value(st.procs.get_all()).unwrap()))
}
async fn get_project_server(
    State(st): State<AppState>,
    Path(name): Path<String>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult {
    // `?cwd=` targets a specific working copy; no cwd → the project's main path (backward-compat).
    let cwd = match q.get("cwd").filter(|s| !s.is_empty()) {
        Some(c) => c.clone(),
        None => projects::project_path_from_name(&name).map_err(server_err)?,
    };
    Ok(Json(serde_json::to_value(st.procs.get_server(&cwd)).unwrap()))
}
async fn get_logs(
    State(st): State<AppState>,
    Path(name): Path<String>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult {
    let cwd = match q.get("cwd").filter(|s| !s.is_empty()) {
        Some(c) => c.clone(),
        None => projects::project_path_from_name(&name).map_err(server_err)?,
    };
    Ok(Json(serde_json::to_value(st.procs.get_logs(&cwd)).unwrap()))
}
async fn post_start(State(st): State<AppState>, Path(name): Path<String>, body: Bytes) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(server_err)?;
    let b = parse_body(&body);
    let cwd = b.get("cwd").and_then(|v| v.as_str()).filter(|s| !s.is_empty());
    let working_dir = cwd.unwrap_or(&dir).to_string();
    if !std::path::Path::new(&working_dir).exists() {
        return Err(bad(format!("Directory does not exist: {working_dir}")));
    }
    let branch = b.get("branch").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from);
    if let Some(br) = &branch {
        if working_dir == dir {
            let d = dir.clone();
            let br2 = br.clone();
            if let Err(e) = blocking(move || git::checkout(&d, &br2)).await {
                return Err(bad(format!("Checkout failed: {e}")));
            }
        }
    }
    let command = match b.get("command").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
        Some(c) => c.to_string(),
        None => {
            let wd = working_dir.clone();
            blocking(move || projects::resolve_dev_command(std::path::Path::new(&wd))).await
        }
    };
    let server = st.procs.start(&name, &working_dir, &command, branch);
    Ok(Json(serde_json::to_value(server).unwrap()))
}
async fn post_stop(State(st): State<AppState>, Path(name): Path<String>, body: Bytes) -> ApiResult {
    let b = parse_body(&body);
    // `{cwd}` targets a specific working copy; no cwd → the project's main path (backward-compat).
    let cwd = match b.get("cwd").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
        Some(c) => c.to_string(),
        None => projects::project_path_from_name(&name).map_err(server_err)?,
    };
    let stopped = st.procs.stop(&cwd, false);
    Ok(Json(json!({ "stopped": stopped })))
}

// --- WebSocket ---
async fn ws_handler(ws: WebSocketUpgrade, State(st): State<AppState>) -> Response {
    ws.on_upgrade(move |socket| handle_ws(socket, st))
}
async fn handle_ws(mut socket: WebSocket, st: AppState) {
    // Prune agents whose process has already exited, then send the current agent views alongside
    // servers. A (re)connecting client rebuilds its statuses from this — so a stale "working" that
    // survived a dropped connection (which otherwise sticks: runaway "thinking" timer, dead Stop)
    // resyncs to reality instead of hanging until an app restart.
    st.agents.prune_dead();
    let hello = json!({ "type": "hello", "servers": st.procs.get_all(), "agents": st.agents.get_all() });
    if socket.send(Message::Text(hello.to_string())).await.is_err() {
        return;
    }
    let mut rx = st.procs.subscribe();
    let mut agent_rx = st.agents.subscribe();
    loop {
        tokio::select! {
            msg = rx.recv() => match msg {
                Ok(text) => {
                    if socket.send(Message::Text(text)).await.is_err() {
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            },
            msg = agent_rx.recv() => match msg {
                Ok(text) => {
                    if socket.send(Message::Text(text)).await.is_err() {
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            },
            client = socket.recv() => match client {
                Some(Ok(_)) => {}
                _ => break,
            },
        }
    }
}

/// Bind the HTTP+WS server on `port` (0 = OS-assigned) using the given process
/// registry, and serve until the task is dropped. Prints the machine-readable
/// ready line the test harness and Tauri shell key off.
pub async fn serve_on_with(port: u16, procs: Arc<Processes>, agents: Arc<agents::Agents>) {
    // Best-effort startup retention sweep: drop persisted chat transcripts older
    // than the configured window (0 = keep forever).
    chat_history::prune(config::load().factory.chat_history_days);
    let state = AppState { procs, agents };
    let app = build_router(state);
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await.expect("bind");
    let actual = listener.local_addr().unwrap().port();
    println!("Kablan.dev listening on http://127.0.0.1:{actual}");
    println!("  scanning projects in: {}", config::load().parent_dir);
    axum::serve(listener, app).await.unwrap();
}

/// Standalone entrypoint (used by the `kablan-server` binary and the test suite).
/// Honors PORT (default 4317) and cleans up child dev servers on SIGINT/SIGTERM.
pub async fn run() {
    let procs = Processes::new();
    let agents_supervisor = agents::Agents::new();
    let port: u16 = match std::env::var("PORT") {
        Ok(p) => p.parse().unwrap_or(4317),
        Err(_) => 4317,
    };
    #[cfg(unix)]
    {
        let procs2 = Arc::clone(&procs);
        let agents2 = Arc::clone(&agents_supervisor);
        tokio::spawn(async move {
            use tokio::signal::unix::{signal, SignalKind};
            let mut term = signal(SignalKind::terminate()).unwrap();
            let mut int = signal(SignalKind::interrupt()).unwrap();
            tokio::select! {
                _ = term.recv() => {},
                _ = int.recv() => {},
            }
            procs2.kill_all();
            agents2.kill_all();
            std::process::exit(0);
        });
    }
    serve_on_with(port, procs, agents_supervisor).await;
}

#[cfg(test)]
mod session_persist_tests {
    use super::*;
    use std::time::SystemTime;

    /// Point config_dir at a fresh temp dir for the duration of a test. Mirrors
    /// chat_history's pattern; run these single-threaded (`--test-threads=1`)
    /// since KABLAN_CONFIG_DIR is process-global.
    struct TempConfig {
        dir: std::path::PathBuf,
    }
    impl TempConfig {
        fn new(tag: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "kablan-session-{tag}-{}",
                SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_nanos()
            ));
            let _ = std::fs::remove_dir_all(&dir);
            std::env::set_var("KABLAN_CONFIG_DIR", &dir);
            TempConfig { dir }
        }
        fn stored_sid(&self, name: &str, branch: &str) -> Option<String> {
            let file = factory::load_file(&factory_store_path());
            factory::get_branch_state(&file, name, branch).and_then(|s| s.agent_session_id.clone())
        }
    }
    impl Drop for TempConfig {
        fn drop(&mut self) {
            std::env::remove_var("KABLAN_CONFIG_DIR");
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    #[test]
    fn sanitizes_user_branch_names() {
        assert_eq!(super::sanitize_branch_name("Fix login bug").as_deref(), Some("fix-login-bug"));
        assert_eq!(super::sanitize_branch_name("feature/New Thing").as_deref(), Some("feature/new-thing"));
        assert_eq!(super::sanitize_branch_name("  --weird__/name..  ").as_deref(), Some("weird__/name"));
        assert_eq!(super::sanitize_branch_name("MyBranch").as_deref(), Some("mybranch"));
        // Nothing usable left → None (caller falls back to the auto session/<hex> name).
        assert_eq!(super::sanitize_branch_name(""), None);
        assert_eq!(super::sanitize_branch_name("   "), None);
        assert_eq!(super::sanitize_branch_name("///"), None);
        assert_eq!(super::sanitize_branch_name("***"), None);
    }

    #[test]
    fn parses_key_into_project_and_branch() {
        assert_eq!(parse_branch_agent_key("proj::branch:feat/x"), Some(("proj", "feat/x")));
        // Branch names routinely contain slashes; the project side stays clean.
        assert_eq!(parse_branch_agent_key("a/b/c::branch:session/abc"), Some(("a/b/c", "session/abc")));
        assert_eq!(parse_branch_agent_key("no-delimiter-here"), None);
    }

    #[test]
    fn persists_session_id_on_first_capture() {
        let cfg = TempConfig::new("first");
        assert_eq!(cfg.stored_sid("proj", "feat/x"), None);
        persist_branch_session_id("proj::branch:feat/x", "sid-1");
        assert_eq!(cfg.stored_sid("proj", "feat/x").as_deref(), Some("sid-1"));
    }

    #[test]
    fn does_not_overwrite_an_existing_session_id() {
        let cfg = TempConfig::new("idempotent");
        persist_branch_session_id("proj::branch:feat/x", "sid-1");
        // A later event carrying a different id must not clobber the stored one —
        // the first id owns the resumable conversation.
        persist_branch_session_id("proj::branch:feat/x", "sid-2");
        assert_eq!(cfg.stored_sid("proj", "feat/x").as_deref(), Some("sid-1"));
    }

    #[test]
    fn ignores_a_malformed_key() {
        let _cfg = TempConfig::new("malformed");
        // Must not panic and must not write anything.
        persist_branch_session_id("garbage-key", "sid-1");
    }
}
