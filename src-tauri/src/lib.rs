//! Kablan.dev native backend — HTTP + WebSocket API, behaviorally identical to
//! the original Node/Express server (validated by the shared server test suite).
pub mod agents;
pub mod config;
pub mod factory;
pub mod git;
pub mod gitlab;
pub mod open;
pub mod processes;
pub mod projects;

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
        .route("/api/projects/:name/open", post(post_open))
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
        .route("/api/projects/:name/factory/session", post(post_new_session))
        .route("/api/projects/:name/factory/agent/start", post(post_branch_agent_start))
        .route("/api/projects/:name/factory/agent/message", post(post_branch_agent_message))
        .route("/api/projects/:name/factory/agent/stop", post(post_branch_agent_stop))
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

async fn get_factory(Path(name): Path<String>) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let key = name.clone();
    let out = blocking(move || {
        let file = factory::load_file(&factory_store_path());
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
    // TODO: running_count() is a soft cap — it's checked-then-acted-on without
    // holding a lock across the check and the later `agents.start()` call, so
    // concurrent starts can race past the limit (small TOCTOU window).
    if st.agents.running_count() >= cfg.factory.max_concurrent_agents as usize {
        return Err(bad("agent limit reached"));
    }
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
        let session_id = factory::get_branch_state(&file, &name2, &branch2).and_then(|s| s.agent_session_id.clone());
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
    let argv = agents::build_agent_argv(&cfg.factory, session_id.as_deref());
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
    let view = start_branch_agent(&st, &name, &branch, copy_node_modules, copy_env, model, permission_mode).await?;
    Ok(Json(serde_json::to_value(view).unwrap()))
}

/// Short, effectively-unique branch suffix for the "New session" flow — the
/// low 32 bits of the current time in nanoseconds, formatted as hex. Mirrors
/// the id-generation convention `factory::create_task_force` used to follow
/// before the branch-centric rewrite (see `git.rs`'s `add_worktree_for_branch`
/// doc comment): short, monotonic-ish, and collision-proof in practice for a
/// single user clicking "New session" — a true collision would just surface
/// as a "branch already exists" git error on the next click.
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
    // Optionally seed the fresh worktree with the project's gitignored dev assets so it can build/
    // run immediately (a new worktree has neither, since both are gitignored).
    let copy_node_modules = b.get("copyNodeModules").and_then(|v| v.as_bool()).unwrap_or(false);
    let copy_env = b.get("copyEnv").and_then(|v| v.as_bool()).unwrap_or(false);

    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let cfg = config::load();
    // Same soft (TOCTOU-able) cap as `start_branch_agent` — see its TODO.
    if st.agents.running_count() >= cfg.factory.max_concurrent_agents as usize {
        return Err(bad("agent limit reached"));
    }

    let new_branch = generate_session_branch();
    let name2 = name.clone();
    let branch2 = new_branch.clone();
    let cfg2 = cfg.clone();
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
        // Copy the requested dev assets from the project's main working copy BEFORE the agent
        // starts, so node_modules/.env are already in place. Best-effort (missing sources skip).
        copy_session_extras(
            std::path::Path::new(&dir),
            std::path::Path::new(&wt.path),
            copy_node_modules,
            copy_env,
        );
        Ok::<_, String>(wt.path)
    })
    .await
    .map_err(bad)?;

    let key = branch_agent_key(&name, &new_branch);
    let argv = agents::build_agent_argv(&cfg.factory, None);
    let _ = st.agents.start(&key, &worktree_path, argv, None);
    if let Some(text) = message {
        st.agents.send(&key, &text, &[]);
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

async fn get_branch_agent(State(st): State<AppState>, Path(name): Path<String>, Query(q): Query<HashMap<String, String>>) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let branch = match q.get("branch").filter(|s| !s.is_empty()) {
        Some(s) => s.clone(),
        None => return Err(bad("branch is required")),
    };
    let key = branch_agent_key(&name, &branch);
    let agent = st.agents.get(&key);
    let events = st.agents.events(&key);

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

    Ok(Json(json!({ "agent": agent, "events": events })))
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
    let hello = json!({ "type": "hello", "servers": st.procs.get_all() });
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
