# GitLab Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a desktop-only GitLab integration to Kablan.dev that shows per-branch Merge Request + CI pipeline status and can create a Merge Request, authenticated with a Personal Access Token stored in the OS keychain.

**Architecture:** A new Rust module `gitlab.rs` resolves a repo's `origin` remote to a GitLab host + project, reads a per-host PAT from the OS keychain, and calls GitLab's REST API (`/api/v4`) over a blocking HTTP client. New Axum endpoints expose a one-shot `overview` (open MRs + latest pipelines) for row badges, plus token management and create-MR. The React frontend gates all GitLab UI on running inside Tauri and on the project being connected.

**Tech Stack:** Rust (Axum, `ureq`+rustls HTTP, `keyring` for the keychain, `serde_json`), `httpmock` (dev-dependency, HTTP mocking), React + TanStack Query, existing shadcn/ui components.

## Global Constraints

- The GitLab layer is **Rust-only** (`src-tauri/`). The Node reference server (`server/`) is NOT modified. The existing 75-test cross-backend parity suite must stay green and untouched.
- The PAT is **never** written to config, returned to the frontend, or logged. Config stores only hostnames (`gitlabHosts: string[]`).
- All JSON is camelCase. Rust structs use `#[serde(rename_all = "camelCase")]`.
- HTTP auth header is `PRIVATE-TOKEN: <token>`.
- New Rust deps (`keyring`, `ureq`) are always-on (not behind the `app` feature) so the `kablan-server` test binary (`--no-default-features`) still builds. `httpmock` is a `[dev-dependencies]` entry.
- Frontend GitLab UI only renders when `isTauri` is true.
- Commit after every task with a `feat(gitlab):` / `test(gitlab):` prefix.

---

## File structure

- Create `src-tauri/src/gitlab.rs` — remote parsing, keychain token store, GitLab HTTP calls, data types.
- Modify `src-tauri/src/config.rs` — add `gitlab_hosts` field + add/remove helpers.
- Modify `src-tauri/src/lib.rs` — `pub mod gitlab;` + 6 handlers + routes.
- Modify `src-tauri/Cargo.toml` — deps `keyring`, `ureq`; dev-dep `httpmock`.
- Modify `web/api.ts` — GitLab types + `api.gitlab.*`.
- Modify `web/queries.ts` — `useGitlabOverview`.
- Modify `web/components/SettingsPage.tsx` — GitLab card.
- Create `web/components/GitlabSection.tsx` — drawer GitLab section + Create-MR form.
- Modify `web/components/ItemDrawer.tsx` — render `GitlabSection` in Overview.
- Modify `web/components/OverviewTab.tsx` — CI dot + MR badge on rows; "Has open MR" / "CI failing" filters.
- Modify `CHANGELOG.md` — changelog entry.

---

### Task 1: Rust deps + config field

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/config.rs`

**Interfaces:**
- Produces: `config::AppConfig.gitlab_hosts: Vec<String>` (JSON `gitlabHosts`); `config::add_gitlab_host(host: &str)`, `config::remove_gitlab_host(host: &str) -> AppConfig`.

- [ ] **Step 1: Add dependencies to `src-tauri/Cargo.toml`**

In `[dependencies]` add:

```toml
keyring = "3"
ureq = { version = "2", features = ["json", "tls"] }
```

Add a new section:

```toml
[dev-dependencies]
httpmock = "0.7"
```

- [ ] **Step 2: Add the config field + default**

In `src-tauri/src/config.rs`, add to `struct AppConfig` (after `linear_workspace`):

```rust
    #[serde(default)]
    pub gitlab_hosts: Vec<String>,
```

In `impl Default for AppConfig`, add `gitlab_hosts: Vec::new(),`.

- [ ] **Step 3: Add host list helpers**

Append to `src-tauri/src/config.rs`:

```rust
pub fn add_gitlab_host(host: &str) -> AppConfig {
    let mut cfg = load();
    if !cfg.gitlab_hosts.iter().any(|h| h == host) {
        cfg.gitlab_hosts.push(host.to_string());
        write(&cfg);
    }
    cfg
}

pub fn remove_gitlab_host(host: &str) -> AppConfig {
    let mut cfg = load();
    cfg.gitlab_hosts.retain(|h| h != host);
    write(&cfg);
    cfg
}
```

(`write` is the existing private fn in config.rs; these helpers live in the same module so they can call it.)

- [ ] **Step 4: Verify it builds**

Run: `cargo build --manifest-path src-tauri/Cargo.toml --bin kablan-server --no-default-features`
Expected: `Finished` (compiles; new deps downloaded).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/config.rs
git commit -m "feat(gitlab): add keyring/ureq deps + gitlabHosts config"
```

---

### Task 2: Remote URL parser

**Files:**
- Create: `src-tauri/src/gitlab.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod gitlab;`)

**Interfaces:**
- Produces: `gitlab::Remote { host: String, project: String }`; `gitlab::parse_remote(url: &str) -> Option<Remote>`; `gitlab::resolve(dir: &str) -> Option<Remote>`.

- [ ] **Step 1: Create the module with the parser + a failing test**

Create `src-tauri/src/gitlab.rs`:

```rust
//! GitLab integration (desktop-only). Resolves a repo's origin remote to a
//! GitLab host + project, reads a per-host PAT from the OS keychain, and calls
//! the GitLab REST API. Never logs or returns the token.
use crate::git;

#[derive(Debug, PartialEq, Eq)]
pub struct Remote {
    pub host: String,
    pub project: String,
}

/// Parse a GitLab remote URL into host + project path. Handles ssh, ssh://, and
/// https forms. Returns None for anything unrecognized.
pub fn parse_remote(url: &str) -> Option<Remote> {
    let url = url.trim();
    let (host, path) = if let Some(rest) = url.strip_prefix("git@") {
        // git@host:group/proj.git
        let (host, path) = rest.split_once(':')?;
        (host.to_string(), path.to_string())
    } else if let Some(rest) = url.strip_prefix("ssh://") {
        // ssh://git@host[:port]/group/proj.git
        let rest = rest.split_once('@').map(|(_, r)| r).unwrap_or(rest);
        let (authority, path) = rest.split_once('/')?;
        let host = authority.split(':').next()?.to_string();
        (host, path.to_string())
    } else if let Some(rest) = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://")) {
        // https://[user@]host/group/proj.git
        let rest = rest.split_once('@').map(|(_, r)| r).unwrap_or(rest);
        let (authority, path) = rest.split_once('/')?;
        let host = authority.split(':').next()?.to_string();
        (host, path.to_string())
    } else {
        return None;
    };
    let project = path.trim_start_matches('/').trim_end_matches('/').strip_suffix(".git").unwrap_or(
        path.trim_start_matches('/').trim_end_matches('/'),
    );
    if host.is_empty() || project.is_empty() {
        return None;
    }
    Some(Remote { host: host.to_lowercase(), project: project.to_string() })
}

/// Resolve the origin remote of `dir` to a GitLab Remote (None if no origin).
pub fn resolve(dir: &str) -> Option<Remote> {
    let url = git::git(dir, &["remote", "get-url", "origin"]).ok()?;
    parse_remote(&url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ssh_https_and_nested_paths() {
        let cases = [
            ("git@gitlab.com:group/proj.git", "gitlab.com", "group/proj"),
            ("git@gl.example.com:group/sub/proj.git", "gl.example.com", "group/sub/proj"),
            ("ssh://git@gitlab.com:22/group/proj.git", "gitlab.com", "group/proj"),
            ("https://gitlab.com/group/proj.git", "gitlab.com", "group/proj"),
            ("https://oauth2:tok@gl.example.com/group/proj", "gl.example.com", "group/proj"),
        ];
        for (url, host, project) in cases {
            let r = parse_remote(url).unwrap_or_else(|| panic!("failed: {url}"));
            assert_eq!(r.host, host, "{url}");
            assert_eq!(r.project, project, "{url}");
        }
    }

    #[test]
    fn rejects_unknown() {
        assert!(parse_remote("").is_none());
        assert!(parse_remote("not a url").is_none());
    }
}
```

Note: `git::git` must be callable — it's currently `pub fn git` in `git.rs`. Confirm it is `pub`; it is.

- [ ] **Step 2: Register the module**

In `src-tauri/src/lib.rs`, add near the other `pub mod` lines:

```rust
pub mod gitlab;
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features gitlab::tests`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/gitlab.rs src-tauri/src/lib.rs
git commit -m "test(gitlab): remote URL parser (ssh/https/nested)"
```

---

### Task 3: Data types + HTTP client core (MR + pipelines)

**Files:**
- Modify: `src-tauri/src/gitlab.rs`

**Interfaces:**
- Produces:
  - `gitlab::MergeRequest`, `gitlab::Pipeline`, `gitlab::Overview` (serde camelCase; shapes below).
  - `gitlab::fetch_open_mrs(base: &str, token: &str, project_id: &str) -> Result<Vec<MergeRequest>, String>`
  - `gitlab::fetch_pipelines(base: &str, token: &str, project_id: &str) -> Result<Vec<Pipeline>, String>`
  - `base` is the full API root, e.g. `https://gitlab.com/api/v4` (tests pass the mock server's URL).

- [ ] **Step 1: Add the serialized types**

Add near the top of `src-tauri/src/gitlab.rs` (after `use`):

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeRequest {
    pub iid: u64,
    pub title: String,
    pub state: String,
    pub draft: bool,
    pub web_url: String,
    pub source_branch: String,
    pub target_branch: String,
    pub pipeline_status: Option<String>,
    pub approvals_required: Option<u32>,
    pub approvals_left: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pipeline {
    #[serde(rename = "ref")]
    pub reference: String,
    pub sha: String,
    pub status: String,
    pub web_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub connected: bool,
    pub host: Option<String>,
    pub project: Option<String>,
    pub mrs: Vec<MergeRequest>,
    pub pipelines: Vec<Pipeline>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
```

- [ ] **Step 2: Add the HTTP GET helper + fetchers with a failing test**

Add to `src-tauri/src/gitlab.rs`:

```rust
fn api_get(base: &str, token: &str, path: &str) -> Result<serde_json::Value, String> {
    let resp = ureq::get(&format!("{base}{path}"))
        .set("PRIVATE-TOKEN", token)
        .call();
    match resp {
        Ok(r) => r.into_json::<serde_json::Value>().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(code, _)) => Err(format!("GitLab API returned {code}")),
        Err(e) => Err(e.to_string()),
    }
}

pub fn fetch_open_mrs(base: &str, token: &str, project_id: &str) -> Result<Vec<MergeRequest>, String> {
    let v = api_get(
        base,
        token,
        &format!("/projects/{project_id}/merge_requests?state=opened&per_page=100"),
    )?;
    let arr = v.as_array().cloned().unwrap_or_default();
    Ok(arr
        .iter()
        .map(|m| MergeRequest {
            iid: m["iid"].as_u64().unwrap_or(0),
            title: m["title"].as_str().unwrap_or("").to_string(),
            state: m["state"].as_str().unwrap_or("opened").to_string(),
            draft: m["draft"].as_bool().or_else(|| m["work_in_progress"].as_bool()).unwrap_or(false),
            web_url: m["web_url"].as_str().unwrap_or("").to_string(),
            source_branch: m["source_branch"].as_str().unwrap_or("").to_string(),
            target_branch: m["target_branch"].as_str().unwrap_or("").to_string(),
            pipeline_status: m["head_pipeline"]["status"].as_str().map(|s| s.to_string()),
            approvals_required: None,
            approvals_left: None,
        })
        .collect())
}

pub fn fetch_pipelines(base: &str, token: &str, project_id: &str) -> Result<Vec<Pipeline>, String> {
    let v = api_get(
        base,
        token,
        &format!("/projects/{project_id}/pipelines?per_page=50&order_by=updated_at"),
    )?;
    let arr = v.as_array().cloned().unwrap_or_default();
    // Keep only the newest pipeline per ref (array is newest-first).
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for p in arr {
        let reference = p["ref"].as_str().unwrap_or("").to_string();
        if reference.is_empty() || !seen.insert(reference.clone()) {
            continue;
        }
        out.push(Pipeline {
            reference,
            sha: p["sha"].as_str().unwrap_or("").to_string(),
            status: p["status"].as_str().unwrap_or("").to_string(),
            web_url: p["web_url"].as_str().unwrap_or("").to_string(),
        });
    }
    Ok(out)
}
```

Add to the `tests` module:

```rust
    #[test]
    fn parses_open_mrs_and_pipelines() {
        let server = httpmock::MockServer::start();
        server.mock(|when, then| {
            when.method("GET").path("/projects/g%2Fp/merge_requests");
            then.status(200).json_body(serde_json::json!([{
                "iid": 12, "title": "Add thing", "state": "opened", "draft": false,
                "web_url": "https://gl/x/-/merge_requests/12",
                "source_branch": "feat/x", "target_branch": "main",
                "head_pipeline": { "status": "success" }
            }]));
        });
        server.mock(|when, then| {
            when.method("GET").path("/projects/g%2Fp/pipelines");
            then.status(200).json_body(serde_json::json!([
                { "ref": "feat/x", "sha": "abc", "status": "success", "web_url": "u1" },
                { "ref": "feat/x", "sha": "old", "status": "failed", "web_url": "u0" },
                { "ref": "feat/y", "sha": "def", "status": "failed", "web_url": "u2" }
            ]));
        });
        let base = server.base_url();
        let mrs = fetch_open_mrs(&base, "tok", "g%2Fp").unwrap();
        assert_eq!(mrs.len(), 1);
        assert_eq!(mrs[0].iid, 12);
        assert_eq!(mrs[0].source_branch, "feat/x");
        assert_eq!(mrs[0].pipeline_status.as_deref(), Some("success"));

        let pipes = fetch_pipelines(&base, "tok", "g%2Fp").unwrap();
        assert_eq!(pipes.len(), 2, "newest per ref only");
        assert_eq!(pipes[0].status, "success");
    }

    #[test]
    fn surfaces_http_errors() {
        let server = httpmock::MockServer::start();
        server.mock(|when, then| {
            when.method("GET");
            then.status(401).json_body(serde_json::json!({"message": "401 Unauthorized"}));
        });
        let err = fetch_open_mrs(&server.base_url(), "bad", "g%2Fp").unwrap_err();
        assert!(err.contains("401"), "got: {err}");
    }
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features gitlab::tests`
Expected: PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/gitlab.rs
git commit -m "test(gitlab): MR + pipeline fetch/parse against mock server"
```

---

### Task 4: validate() + create_merge_request()

**Files:**
- Modify: `src-tauri/src/gitlab.rs`

**Interfaces:**
- Produces:
  - `gitlab::validate(base: &str, token: &str) -> Result<String, String>` (returns username).
  - `gitlab::CreateMrArgs { source_branch, target_branch, title, description, draft, remove_source_branch }`
  - `gitlab::create_merge_request(base: &str, token: &str, project_id: &str, args: &CreateMrArgs) -> Result<(u64, String), String>` (returns `(iid, web_url)`).

- [ ] **Step 1: Add validate + create with a failing test**

Add to `src-tauri/src/gitlab.rs`:

```rust
pub fn validate(base: &str, token: &str) -> Result<String, String> {
    let v = api_get(base, token, "/user")?;
    v["username"].as_str().map(|s| s.to_string()).ok_or_else(|| "unexpected /user response".to_string())
}

pub struct CreateMrArgs {
    pub source_branch: String,
    pub target_branch: String,
    pub title: String,
    pub description: String,
    pub draft: bool,
    pub remove_source_branch: bool,
}

pub fn create_merge_request(
    base: &str,
    token: &str,
    project_id: &str,
    args: &CreateMrArgs,
) -> Result<(u64, String), String> {
    // GitLab marks drafts via a "Draft:" title prefix.
    let title = if args.draft && !args.title.starts_with("Draft:") {
        format!("Draft: {}", args.title)
    } else {
        args.title.clone()
    };
    let body = serde_json::json!({
        "source_branch": args.source_branch,
        "target_branch": args.target_branch,
        "title": title,
        "description": args.description,
        "remove_source_branch": args.remove_source_branch,
    });
    let resp = ureq::post(&format!("{base}/projects/{project_id}/merge_requests"))
        .set("PRIVATE-TOKEN", token)
        .send_json(body);
    match resp {
        Ok(r) => {
            let v = r.into_json::<serde_json::Value>().map_err(|e| e.to_string())?;
            let iid = v["iid"].as_u64().ok_or("no iid in response")?;
            let url = v["web_url"].as_str().unwrap_or("").to_string();
            Ok((iid, url))
        }
        Err(ureq::Error::Status(code, r)) => {
            let msg = r.into_json::<serde_json::Value>().ok()
                .and_then(|v| v["message"].as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| format!("GitLab API returned {code}"));
            Err(msg)
        }
        Err(e) => Err(e.to_string()),
    }
}
```

Add to the `tests` module:

```rust
    #[test]
    fn validate_returns_username() {
        let server = httpmock::MockServer::start();
        server.mock(|when, then| {
            when.method("GET").path("/user");
            then.status(200).json_body(serde_json::json!({"username": "shaked"}));
        });
        assert_eq!(validate(&server.base_url(), "tok").unwrap(), "shaked");
    }

    #[test]
    fn create_mr_sends_draft_prefix_and_returns_iid() {
        let server = httpmock::MockServer::start();
        let m = server.mock(|when, then| {
            when.method("POST")
                .path("/projects/g%2Fp/merge_requests")
                .json_body_partial(r#"{"title":"Draft: My MR","source_branch":"feat/x","target_branch":"main"}"#);
            then.status(201).json_body(serde_json::json!({"iid": 7, "web_url": "https://gl/mr/7"}));
        });
        let args = CreateMrArgs {
            source_branch: "feat/x".into(),
            target_branch: "main".into(),
            title: "My MR".into(),
            description: "".into(),
            draft: true,
            remove_source_branch: false,
        };
        let (iid, url) = create_merge_request(&server.base_url(), "tok", "g%2Fp", &args).unwrap();
        m.assert();
        assert_eq!(iid, 7);
        assert_eq!(url, "https://gl/mr/7");
    }
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features gitlab::tests`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/gitlab.rs
git commit -m "test(gitlab): validate() + create_merge_request() with draft prefix"
```

---

### Task 5: Keychain token store + high-level overview()/create()/connect()

**Files:**
- Modify: `src-tauri/src/gitlab.rs`

**Interfaces:**
- Produces (called by the HTTP handlers in Task 6):
  - `gitlab::get_token(host: &str) -> Option<String>`
  - `gitlab::set_token(host: &str, token: &str) -> Result<(), String>`
  - `gitlab::delete_token(host: &str) -> Result<(), String>`
  - `gitlab::api_base(host: &str) -> String` → `https://<host>/api/v4`
  - `gitlab::overview(dir: &str) -> Overview`
  - `gitlab::create(dir: &str, args: &CreateMrArgs) -> Result<(u64, String), String>`
  - `gitlab::status(dir: &str) -> (bool, Option<String>, Option<String>)` → (connected, host, project)

- [ ] **Step 1: Add keychain wrappers + orchestration (no test — thin wrappers + network)**

Add to `src-tauri/src/gitlab.rs`:

```rust
const KEYRING_SERVICE: &str = "dev.kablan.gitlab";

pub fn api_base(host: &str) -> String {
    format!("https://{host}/api/v4")
}

pub fn get_token(host: &str) -> Option<String> {
    keyring::Entry::new(KEYRING_SERVICE, host).ok()?.get_password().ok()
}

pub fn set_token(host: &str, token: &str) -> Result<(), String> {
    keyring::Entry::new(KEYRING_SERVICE, host)
        .map_err(|e| e.to_string())?
        .set_password(token)
        .map_err(|e| e.to_string())
}

pub fn delete_token(host: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, host).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Project id GitLab expects: URL-encoded full path.
fn project_id(project: &str) -> String {
    project.replace('/', "%2F")
}

fn is_configured(host: &str) -> bool {
    crate::config::load().gitlab_hosts.iter().any(|h| h == host)
}

pub fn status(dir: &str) -> (bool, Option<String>, Option<String>) {
    match resolve(dir) {
        Some(r) => {
            let connected = is_configured(&r.host) && get_token(&r.host).is_some();
            (connected, Some(r.host), Some(r.project))
        }
        None => (false, None, None),
    }
}

pub fn overview(dir: &str) -> Overview {
    let remote = match resolve(dir) {
        Some(r) => r,
        None => return Overview { connected: false, host: None, project: None, mrs: vec![], pipelines: vec![], error: None },
    };
    let host = remote.host.clone();
    let project = remote.project.clone();
    if !is_configured(&host) {
        return Overview { connected: false, host: Some(host), project: Some(project), mrs: vec![], pipelines: vec![], error: None };
    }
    let token = match get_token(&host) {
        Some(t) => t,
        None => return Overview { connected: false, host: Some(host), project: Some(project), mrs: vec![], pipelines: vec![], error: None },
    };
    let base = api_base(&host);
    let id = project_id(&project);
    match (fetch_open_mrs(&base, &token, &id), fetch_pipelines(&base, &token, &id)) {
        (Ok(mrs), Ok(pipelines)) => Overview { connected: true, host: Some(host), project: Some(project), mrs, pipelines, error: None },
        (Err(e), _) | (_, Err(e)) => Overview { connected: true, host: Some(host), project: Some(project), mrs: vec![], pipelines: vec![], error: Some(e) },
    }
}

pub fn create(dir: &str, args: &CreateMrArgs) -> Result<(u64, String), String> {
    let remote = resolve(dir).ok_or("not a GitLab repo (no origin remote)")?;
    let token = get_token(&remote.host).ok_or("no token for this GitLab host")?;
    create_merge_request(&api_base(&remote.host), &token, &project_id(&remote.project), args)
}
```

- [ ] **Step 2: Verify it builds**

Run: `cargo build --manifest-path src-tauri/Cargo.toml --bin kablan-server --no-default-features`
Expected: `Finished`.

- [ ] **Step 3: Run the existing gitlab tests (still pass)**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features gitlab::tests`
Expected: PASS (6 tests).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/gitlab.rs
git commit -m "feat(gitlab): keychain token store + overview/create/status orchestration"
```

---

### Task 6: Axum endpoints

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: everything from `gitlab` (Task 5) and `config::{add_gitlab_host, remove_gitlab_host, load}`.
- Produces routes:
  - `GET /api/gitlab/hosts` → `{ hosts: string[] }`
  - `PUT /api/gitlab/token` `{host, token}` → `{ ok: true, username }`
  - `DELETE /api/gitlab/token` `{host}` → `{ ok: true }`
  - `GET /api/projects/:name/gitlab/status` → `{ connected, host, project }`
  - `GET /api/projects/:name/gitlab/overview` → `Overview`
  - `POST /api/projects/:name/gitlab/mr` `{sourceBranch, targetBranch, title, description?, draft?, removeSourceBranch?}` → `{ iid, webUrl }`

- [ ] **Step 1: Register routes**

In `build_router` in `src-tauri/src/lib.rs`, add (after the `/fetch` route):

```rust
        .route("/api/gitlab/hosts", get(get_gitlab_hosts))
        .route("/api/gitlab/token", put(put_gitlab_token).delete(delete_gitlab_token))
        .route("/api/projects/:name/gitlab/status", get(get_gitlab_status))
        .route("/api/projects/:name/gitlab/overview", get(get_gitlab_overview))
        .route("/api/projects/:name/gitlab/mr", post(post_gitlab_mr))
```

- [ ] **Step 2: Add the handlers**

Add near the other handlers in `src-tauri/src/lib.rs`:

```rust
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

async fn get_gitlab_status(Path(name): Path<String>) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let (connected, host, project) = blocking(move || gitlab::status(&dir)).await;
    Ok(Json(json!({ "connected": connected, "host": host, "project": project })))
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
```

- [ ] **Step 3: Verify it builds + parity suite still green**

Run: `cargo build --manifest-path src-tauri/Cargo.toml --bin kablan-server --no-default-features`
Expected: `Finished`.

Run: `npm run test:server:rust 2>&1 | tail -6`
Expected: `# fail 0` (existing 75 tests still pass; GitLab routes are additive).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(gitlab): HTTP endpoints (hosts/token/status/overview/create-mr)"
```

---

### Task 7: Frontend API client + query hook

**Files:**
- Modify: `web/api.ts`
- Modify: `web/queries.ts`

**Interfaces:**
- Produces:
  - Types `GitlabMergeRequest`, `GitlabPipeline`, `GitlabOverview`.
  - `api.gitlab.{ hosts, setToken, deleteToken, status, overview, createMr }`.
  - `useGitlabOverview(name: string)` — enabled only when `isTauri`.

- [ ] **Step 1: Add types + client methods to `web/api.ts`**

Add types near the other interfaces:

```ts
export interface GitlabMergeRequest {
  iid: number;
  title: string;
  state: string;
  draft: boolean;
  webUrl: string;
  sourceBranch: string;
  targetBranch: string;
  pipelineStatus: string | null;
  approvalsRequired: number | null;
  approvalsLeft: number | null;
}
export interface GitlabPipeline {
  ref: string;
  sha: string;
  status: string;
  webUrl: string;
}
export interface GitlabOverview {
  connected: boolean;
  host: string | null;
  project: string | null;
  mrs: GitlabMergeRequest[];
  pipelines: GitlabPipeline[];
  error?: string;
}
```

Add to the `api` object (after `openIn`):

```ts
  gitlab: {
    hosts: () => req<{ hosts: string[] }>("/api/gitlab/hosts"),
    setToken: (host: string, token: string) =>
      req<{ ok: boolean; username: string }>("/api/gitlab/token", {
        method: "PUT",
        body: JSON.stringify({ host, token }),
      }),
    deleteToken: (host: string) =>
      req<{ ok: boolean }>("/api/gitlab/token", { method: "DELETE", body: JSON.stringify({ host }) }),
    status: (name: string) =>
      req<{ connected: boolean; host: string | null; project: string | null }>(
        `/api/projects/${encodeURIComponent(name)}/gitlab/status`,
      ),
    overview: (name: string) =>
      req<GitlabOverview>(`/api/projects/${encodeURIComponent(name)}/gitlab/overview`),
    createMr: (
      name: string,
      body: {
        sourceBranch: string;
        targetBranch: string;
        title: string;
        description?: string;
        draft?: boolean;
        removeSourceBranch?: boolean;
      },
    ) =>
      req<{ iid: number; webUrl: string }>(`/api/projects/${encodeURIComponent(name)}/gitlab/mr`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
```

- [ ] **Step 2: Add the query hook to `web/queries.ts`**

Add (import `isTauri` at the top: `import { isTauri } from "./lib/version.ts";`):

```ts
export function useGitlabOverview(name: string) {
  return useQuery({
    queryKey: ["gitlab-overview", name] as const,
    queryFn: () => api.gitlab.overview(name),
    enabled: isTauri && !!name,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit -p . && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add web/api.ts web/queries.ts
git commit -m "feat(gitlab): frontend api client + useGitlabOverview hook"
```

---

### Task 8: Settings — GitLab card

**Files:**
- Modify: `web/components/SettingsPage.tsx`

**Interfaces:**
- Consumes: `api.gitlab.{hosts,setToken,deleteToken}`, `isTauri`.

- [ ] **Step 1: Add state + handlers**

In `SettingsPage`, add imports: `import { isTauri } from "../lib/version.ts";` and lucide `Trash2` (already imported) — add `Link2` to the lucide import.

Add state near the other `useState`s:

```tsx
  const [glHosts, setGlHosts] = useState<string[]>([]);
  const [glHost, setGlHost] = useState("");
  const [glToken, setGlToken] = useState("");
  const [glBusy, setGlBusy] = useState(false);

  useEffect(() => {
    if (isTauri) api.gitlab.hosts().then((r) => setGlHosts(r.hosts)).catch(() => {});
  }, []);

  const glConnect = async () => {
    if (!glHost.trim() || !glToken.trim()) return;
    setGlBusy(true);
    try {
      const r = await api.gitlab.setToken(glHost.trim().toLowerCase(), glToken.trim());
      toast.success(`Connected to ${glHost} as ${r.username}`);
      setGlToken("");
      setGlHost("");
      setGlHosts((await api.gitlab.hosts()).hosts);
    } catch (err) {
      toast.error(`Couldn't connect: ${String(err)}`);
    } finally {
      setGlBusy(false);
    }
  };

  const glDisconnect = async (host: string) => {
    await api.gitlab.deleteToken(host).catch(() => {});
    setGlHosts((await api.gitlab.hosts()).hosts);
    toast.success(`Disconnected ${host}`);
  };
```

- [ ] **Step 2: Add the card in the General tab**

Add after the "About & updates" `</Card>` in the `general` TabsContent:

```tsx
              {isTauri && (
                <Card>
                  <CardHeader>
                    <CardTitle>GitLab</CardTitle>
                    <CardDescription>
                      Connect a GitLab host to see Merge Request &amp; pipeline status and open MRs.
                      Use a Personal Access Token with the <code className="font-mono">api</code> scope
                      — it's stored in your OS keychain, never in this config.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {glHosts.length > 0 && (
                      <div className="flex flex-col gap-2">
                        {glHosts.map((h) => (
                          <div key={h} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                            <Link2 className="size-4 text-muted-foreground" />
                            <span className="font-mono">{h}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto text-muted-foreground"
                              onClick={() => glDisconnect(h)}
                            >
                              <Trash2 className="size-4" /> Disconnect
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <Label>Add a host</Label>
                      <Input
                        value={glHost}
                        placeholder="gitlab.com or gitlab.mycompany.com"
                        spellCheck={false}
                        className="font-mono text-xs"
                        onChange={(e) => setGlHost(e.target.value)}
                      />
                      <Input
                        value={glToken}
                        type="password"
                        placeholder="Personal Access Token (api scope)"
                        spellCheck={false}
                        className="font-mono text-xs"
                        onChange={(e) => setGlToken(e.target.value)}
                      />
                      <Button size="sm" className="self-start" disabled={glBusy} onClick={glConnect}>
                        {glBusy ? "Connecting…" : "Test & connect"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit -p . && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add web/components/SettingsPage.tsx
git commit -m "feat(gitlab): Settings card to connect/disconnect GitLab hosts"
```

---

### Task 9: Drawer — GitLab section + Create MR form

**Files:**
- Create: `web/components/GitlabSection.tsx`
- Modify: `web/components/ItemDrawer.tsx`

**Interfaces:**
- Consumes: `useGitlabOverview`, `api.gitlab.createMr`, `Entry`, `pipelineTone` (defined here, reused by Task 10 — export it).
- Produces: `export function pipelineTone(status: string | null): string` (tailwind text color class); `export function GitlabSection({ project, branch, defaultTarget }: {...})`.

- [ ] **Step 1: Create the section component**

Create `web/components/GitlabSection.tsx`:

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, GitMerge } from "lucide-react";
import { api } from "../api.ts";
import { useGitlabOverview } from "../queries.ts";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Tailwind text color for a pipeline/CI status. */
export function pipelineTone(status: string | null): string {
  switch (status) {
    case "success":
      return "text-emerald-600 dark:text-emerald-400";
    case "failed":
      return "text-rose-600 dark:text-rose-400";
    case "running":
    case "pending":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "text-muted-foreground";
  }
}

export function GitlabSection({
  project,
  branch,
  defaultTarget,
}: {
  project: string;
  branch: string | null;
  defaultTarget: string;
}) {
  const qc = useQueryClient();
  const ov = useGitlabOverview(project);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState(defaultTarget);
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState(false);
  const [removeSource, setRemoveSource] = useState(true);

  if (!ov.data || !ov.data.connected) return null; // hidden unless connected
  const data = ov.data;
  const mr = branch ? data.mrs.find((m) => m.sourceBranch === branch) : undefined;
  const pipeline = branch ? data.pipelines.find((p) => p.ref === branch) : undefined;
  const status = mr?.pipelineStatus ?? pipeline?.status ?? null;

  const submit = async () => {
    if (!branch || !title.trim()) return;
    setCreating(true);
    try {
      const r = await api.gitlab.createMr(project, {
        sourceBranch: branch,
        targetBranch: target,
        title: title.trim(),
        description,
        draft,
        removeSourceBranch: removeSource,
      });
      toast.success(`Created MR !${r.iid}`, {
        duration: 8000,
        action: { label: "Open", onClick: () => api.gitlab.status(project).then(() => window.open(r.webUrl, "_blank")) },
      });
      setShowForm(false);
      setTitle("");
      qc.invalidateQueries({ queryKey: ["gitlab-overview", project] });
    } catch (err) {
      toast.error(`Create MR failed: ${String(err)}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">GitLab</h3>
      {data.error && <p className="text-xs text-rose-500">{data.error}</p>}

      {mr ? (
        <a
          href={mr.webUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent/50"
        >
          <GitMerge className="size-4 text-orange-500" />
          <span className="truncate">
            !{mr.iid} {mr.title}
          </span>
          <span className={cn("ml-auto shrink-0 text-xs", pipelineTone(mr.pipelineStatus))}>
            {mr.draft ? "draft" : mr.state}
            {mr.pipelineStatus ? ` · ${mr.pipelineStatus}` : ""}
          </span>
        </a>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>No open MR for this branch.</span>
          {status && <span className={cn("text-xs", pipelineTone(status))}>CI: {status}</span>}
        </div>
      )}

      {pipeline && (
        <a href={pipeline.webUrl} target="_blank" rel="noreferrer" className={cn("text-xs hover:underline", pipelineTone(pipeline.status))}>
          Pipeline: {pipeline.status} ↗
        </a>
      )}

      {branch && !mr && !showForm && (
        <Button size="sm" variant="outline" className="self-start" onClick={() => { setTitle(branch); setTarget(defaultTarget); setShowForm(true); }}>
          <GitMerge className="size-3.5" /> Create MR
        </Button>
      )}

      {showForm && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="MR title" className="text-sm" />
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{branch}</span>
            <span className="text-muted-foreground">→</span>
            <Input value={target} onChange={(e) => setTarget(e.target.value)} className="h-7 w-40 font-mono text-xs" />
          </div>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="min-h-[80px] text-sm" />
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Draft
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={removeSource} onChange={(e) => setRemoveSource(e.target.checked)} /> Delete source branch
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={creating || !title.trim()} onClick={submit}>
              {creating ? "Creating…" : "Create MR"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render it in the drawer Overview tab**

In `web/components/ItemDrawer.tsx`, import: `import { GitlabSection } from "./GitlabSection.tsx";`.

In the Overview `TabsContent`, immediately after the Commit-activity `</div>` block (the last child inside `<div className="flex flex-col gap-5">`), add:

```tsx
                  <GitlabSection
                    project={project.name}
                    branch={entry.branchName}
                    defaultTarget={project.currentBranch ?? "main"}
                  />
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit -p . && npm run build`
Expected: clean. (If `Textarea` isn't already exported from `@/components/ui/textarea`, confirm the path — it is used by `EnvTab.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add web/components/GitlabSection.tsx web/components/ItemDrawer.tsx
git commit -m "feat(gitlab): drawer GitLab section + Create MR form"
```

---

### Task 10: Row badges (CI dot + MR badge)

**Files:**
- Modify: `web/components/OverviewTab.tsx`

**Interfaces:**
- Consumes: `useGitlabOverview`, `pipelineTone` (from `GitlabSection.tsx`), `GitlabMergeRequest`.

- [ ] **Step 1: Fetch the overview and build lookup maps**

In `OverviewTab`, add imports:

```ts
import { useGitlabOverview } from "../queries.ts";
import { pipelineTone } from "./GitlabSection.tsx";
```

Inside the component (near the other hooks):

```tsx
  const gitlab = useGitlabOverview(project.name);
  const mrByBranch = useMemo(() => {
    const m = new Map<string, (typeof gitlab.data.mrs)[number]>();
    gitlab.data?.mrs.forEach((mr) => m.set(mr.sourceBranch, mr));
    return m;
  }, [gitlab.data]);
  const ciByRef = useMemo(() => {
    const m = new Map<string, string>();
    gitlab.data?.pipelines.forEach((p) => m.set(p.ref, p.status));
    gitlab.data?.mrs.forEach((mr) => {
      if (mr.pipelineStatus && !m.has(mr.sourceBranch)) m.set(mr.sourceBranch, mr.pipelineStatus);
    });
    return m;
  }, [gitlab.data]);
```

- [ ] **Step 2: Pass MR + CI to each row**

In the `EntryRow` usage, add props:

```tsx
                      mr={row.entry.branchName ? mrByBranch.get(row.entry.branchName) : undefined}
                      ciStatus={row.entry.branchName ? ciByRef.get(row.entry.branchName) ?? null : null}
```

Add to the `EntryRow` signature params: `mr` and `ciStatus`, and to its prop types:

```tsx
  mr?: import("../api.ts").GitlabMergeRequest;
  ciStatus?: string | null;
```

- [ ] **Step 3: Render the badges in the row**

In `EntryRow`, right after the `{entry.remoteOnly && (...)}` badge block, add:

```tsx
      {ciStatus && (
        <span
          title={`CI: ${ciStatus}`}
          className={cn(
            "size-2 shrink-0 rounded-full",
            ciStatus === "success" ? "bg-emerald-500" : ciStatus === "failed" ? "bg-rose-500" : "bg-amber-500",
          )}
        />
      )}
      {mr && (
        <span
          className={cn(
            "shrink-0 rounded-md border-0 px-1.5 py-0.5 text-[10.5px] font-semibold",
            "bg-orange-500/15 text-orange-600 dark:text-orange-400",
          )}
          title={mr.title}
        >
          !{mr.iid}
          {mr.draft ? " draft" : ""}
        </span>
      )}
```

(`pipelineTone` is imported for consistency with the drawer, but the row uses a compact dot; keeping the import is fine as it's used in Task 11 filter tooltip — if unused after Task 11, remove it to satisfy tsc.)

- [ ] **Step 4: Verify typecheck + build**

Run: `npx tsc --noEmit -p . && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add web/components/OverviewTab.tsx
git commit -m "feat(gitlab): CI status dot + MR badge on rows"
```

---

### Task 11: Filter toggles (Has open MR / CI failing)

**Files:**
- Modify: `web/components/OverviewTab.tsx`

**Interfaces:**
- Consumes: `mrByBranch`, `ciByRef` (Task 10).

- [ ] **Step 1: Add state + reset + count**

Add state: `const [hasMr, setHasMr] = useState(false);` and `const [ciFailing, setCiFailing] = useState(false);`

Add both to `activeCount` (`+ (hasMr ? 1 : 0) + (ciFailing ? 1 : 0)`) and to `clearFilters` (`setHasMr(false); setCiFailing(false);`).

- [ ] **Step 2: Filter logic**

In the `rows` useMemo `filtered` callback, add:

```tsx
      if (hasMr && !(e.branchName && mrByBranch.has(e.branchName))) return false;
      if (ciFailing && !(e.branchName && ciByRef.get(e.branchName) === "failed")) return false;
```

Add `hasMr, ciFailing, mrByBranch, ciByRef` to the `rows` useMemo dependency array.

- [ ] **Step 3: Chips + menu rows**

Add chips (after the `dirtyOnly` chip):

```tsx
  if (hasMr) chips.push({ key: "mr", label: "Has open MR", clear: () => setHasMr(false) });
  if (ciFailing) chips.push({ key: "ci", label: "CI failing", clear: () => setCiFailing(false) });
```

Add menu rows (after the "Uncommitted changes" `FilterRow`), only when connected — import `GitMerge` in the lucide import:

```tsx
                {gitlab.data?.connected && (
                  <>
                    <FilterRow
                      icon={GitMerge}
                      label="Has open MR"
                      active={hasMr}
                      onClick={() => { setHasMr((v) => !v); closeFilter(); }}
                    />
                    <FilterRow
                      label="CI failing"
                      active={ciFailing}
                      onClick={() => { setCiFailing((v) => !v); closeFilter(); }}
                    />
                  </>
                )}
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npx tsc --noEmit -p . && npm run build`
Expected: clean. (Remove the `pipelineTone` import from Task 10 if it's now unused.)

- [ ] **Step 5: Commit**

```bash
git add web/components/OverviewTab.tsx
git commit -m "feat(gitlab): Has-open-MR / CI-failing filters"
```

---

### Task 12: Docs + manual verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add a changelog entry**

Under `## [Unreleased]` in `CHANGELOG.md`:

```markdown
### Added
- **GitLab integration** (desktop app): connect a GitLab host in Settings with a
  Personal Access Token (stored in the OS keychain). Rows show CI pipeline status
  and open-MR badges; the drawer shows MR state + pipeline and can **create a
  Merge Request**. New "Has open MR" / "CI failing" filters. Works with
  gitlab.com and self-hosted; provider auto-detected from the repo's origin remote.
```

- [ ] **Step 2: Full verification suite**

Run: `npx tsc --noEmit -p . && npm run build`
Expected: clean.

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features gitlab::tests`
Expected: PASS (6 tests).

Run: `npm run test:server:rust 2>&1 | tail -6`
Expected: `# fail 0` (75 parity tests still green).

- [ ] **Step 3: Manual check (packaged/dev app, human)**

Build + run the desktop app (`npm run tauri:dev`). Then:
1. Settings → GitLab → add your host + PAT → "Test & connect" → expect a success toast with your username.
2. Open a project whose origin is that GitLab host → rows show CI dots / MR badges; drawer shows the GitLab section.
3. On a branch with no MR, use **Create MR** → expect a toast with the new MR link; the badge appears after refresh.
4. In browser dev mode (`npm run dev`) confirm no GitLab UI appears (gated on `isTauri`).

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(gitlab): changelog entry for GitLab integration"
```

---

## Self-review notes

- **Spec coverage:** MR status (Tasks 3,9,10), CI status (Tasks 3,9,10), create-MR (Tasks 4,6,9), PAT+keychain (Tasks 5,6,8), per-host + auto-detect (Tasks 2,5), desktop-only gating (Tasks 7–11 via `isTauri`), one-shot overview (Tasks 3,5,6,10), Settings card (8), filters (11), error handling (overview `error` field + non-toast surfacing in 9), security (token never returned — endpoints return only `username`/`ok`), tests (2,3,4 + parity in 6,12). Deep-link fallback: partially covered (drawer links to MR/pipeline web URLs); a no-token deep-link for Create-MR is intentionally deferred (YAGNI) and noted.
- **Types:** `Overview/GitlabOverview`, `MergeRequest/GitlabMergeRequest`, `Pipeline/GitlabPipeline`, `CreateMrArgs`, and the `pipelineTone` helper are consistent across backend/frontend and referenced with matching field names (camelCase).
