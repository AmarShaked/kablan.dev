//! Kablan.dev native backend — HTTP + WebSocket API, behaviorally identical to
//! the original Node/Express server (validated by the shared server test suite).
pub mod config;
pub mod git;
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
    let dir = match &cwd {
        Some(c) => {
            let n = name.clone();
            let c = c.clone();
            blocking(move || projects::resolve_workdir(&n, Some(&c))).await.map_err(bad)?
        }
        None => projects::project_path_from_name(&name).map_err(bad)?,
    };
    let diff = blocking(move || git::get_diff(&dir, sha.as_deref())).await;
    Ok(Json(json!({ "diff": diff })))
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
async fn get_project_server(State(st): State<AppState>, Path(name): Path<String>) -> ApiResult {
    Ok(Json(serde_json::to_value(st.procs.get_server(&name)).unwrap()))
}
async fn get_logs(State(st): State<AppState>, Path(name): Path<String>) -> ApiResult {
    Ok(Json(serde_json::to_value(st.procs.get_logs(&name)).unwrap()))
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
async fn post_stop(State(st): State<AppState>, Path(name): Path<String>) -> ApiResult {
    let stopped = st.procs.stop(&name, false);
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
pub async fn serve_on_with(port: u16, procs: Arc<Processes>) {
    let state = AppState { procs };
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
    let port: u16 = match std::env::var("PORT") {
        Ok(p) => p.parse().unwrap_or(4317),
        Err(_) => 4317,
    };
    #[cfg(unix)]
    {
        let procs2 = Arc::clone(&procs);
        tokio::spawn(async move {
            use tokio::signal::unix::{signal, SignalKind};
            let mut term = signal(SignalKind::terminate()).unwrap();
            let mut int = signal(SignalKind::interrupt()).unwrap();
            tokio::select! {
                _ = term.recv() => {},
                _ = int.recv() => {},
            }
            procs2.kill_all();
            std::process::exit(0);
        });
    }
    serve_on_with(port, procs).await;
}
