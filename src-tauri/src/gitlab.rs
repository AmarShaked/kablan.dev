//! GitLab integration (desktop-only). Resolves a repo's origin remote to a
//! GitLab host + project, reads a per-host PAT from the OS keychain, and calls
//! the GitLab REST API. Never logs or returns the token.
use crate::git;
use serde::Serialize;

#[derive(Debug, PartialEq, Eq)]
pub struct Remote {
    pub host: String,
    pub project: String,
}

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
}
