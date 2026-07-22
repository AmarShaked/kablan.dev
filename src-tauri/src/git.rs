//! Git helpers — mirrors server/git.ts. All functions are synchronous (run from
//! spawn_blocking in the HTTP layer). JSON field names match the Node server.
use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub current: bool,
    pub upstream: Option<String>,
    pub last_commit: Option<String>,
    pub last_commit_date: Option<String>,
    pub last_commit_ts: Option<i64>,
    pub author: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    /// True when the branch exists only on a remote (no local ref yet).
    pub remote_only: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub path: String,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub bare: bool,
    pub detached: bool,
    pub locked: bool,
    pub is_main: bool,
    pub last_commit_ts: Option<i64>,
    pub author: Option<String>,
}

/// Run `git <args>` in `cwd`, returning trimmed stdout, or Err(git's message).
pub fn git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        Err(if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "git command failed".to_string()
        })
    }
}

/// Run git, returning combined stdout+stderr (used by pull, which surfaces both).
fn git_combined(cwd: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    if out.status.success() {
        Ok(format!("{stdout}{stderr}").trim().to_string())
    } else {
        let s = stderr.trim();
        let o = stdout.trim();
        Err(if !s.is_empty() {
            s.to_string()
        } else if !o.is_empty() {
            o.to_string()
        } else {
            "git command failed".to_string()
        })
    }
}

pub fn current_branch(dir: &str) -> Option<String> {
    match git(dir, &["rev-parse", "--abbrev-ref", "HEAD"]) {
        Ok(s) if s == "HEAD" => None,
        Ok(s) if !s.is_empty() => Some(s),
        _ => None,
    }
}

pub fn last_commit_ts(dir: &str) -> Option<i64> {
    git(dir, &["log", "-1", "--format=%ct"])
        .ok()
        .and_then(|s| s.parse::<i64>().ok())
}

/// The repo's default branch (origin/HEAD, else main/master), or None.
fn default_branch(dir: &str) -> Option<String> {
    if let Ok(head) = git(dir, &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]) {
        if !head.is_empty() {
            return Some(head.strip_prefix("origin/").unwrap_or(&head).to_string());
        }
    }
    for b in ["main", "master"] {
        if let Ok(s) = git(dir, &["rev-parse", "--verify", "--quiet", b]) {
            if !s.is_empty() {
                return Some(b.to_string());
            }
        }
    }
    None
}

/// Commit timestamps (unix seconds) for the heatmap — the last 6 months, and for
/// a feature branch only the commits since it forked from the default branch.
pub fn commit_activity(dir: &str, reff: Option<&str>) -> Vec<i64> {
    let target = reff.unwrap_or("HEAD");
    let def = default_branch(dir);
    let mut range = target.to_string();
    if let (Some(d), Some(r)) = (def.as_deref(), reff) {
        if r != d {
            if let Ok(base) = git(dir, &["merge-base", d, target]) {
                let base = base.trim();
                if !base.is_empty() {
                    range = format!("{base}..{target}");
                }
            }
        }
    }
    let args = [
        "log",
        "--format=%ct",
        "--max-count=5000",
        "--since=6.months.ago",
        &range,
    ];
    match git(dir, &args) {
        Ok(out) if !out.is_empty() => out
            .lines()
            .filter_map(|l| l.trim().parse::<i64>().ok())
            .collect(),
        _ => vec![],
    }
}

fn head_meta(dir: &str) -> (Option<i64>, Option<String>) {
    match git(dir, &["log", "-1", "--format=%ct%x09%an"]) {
        Ok(out) => {
            let mut parts = out.splitn(2, '\t');
            let ts = parts.next().and_then(|s| s.parse::<i64>().ok());
            let an = parts.next().filter(|s| !s.is_empty()).map(|s| s.to_string());
            (ts, an)
        }
        Err(_) => (None, None),
    }
}

pub fn list_branches(dir: &str) -> Vec<Branch> {
    let fmt = "%(refname:short)%09%(HEAD)%09%(upstream:short)%09%(objectname:short)%09%(committerdate:relative)%09%(committerdate:unix)%09%(authorname)%09%(upstream:track,nobracket)";
    let format_arg = format!("--format={fmt}");
    let out = git(dir, &["for-each-ref", "--sort=-committerdate", &format_arg, "refs/heads"])
        .unwrap_or_default();
    let mut branches: Vec<Branch> = out
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let f: Vec<&str> = line.splitn(8, '\t').collect();
            let get = |i: usize| f.get(i).copied().unwrap_or("");
            let track = get(7);
            Branch {
                name: get(0).to_string(),
                current: get(1) == "*",
                upstream: non_empty(get(2)),
                last_commit: non_empty(get(3)),
                last_commit_date: non_empty(get(4)),
                last_commit_ts: get(5).parse::<i64>().ok(),
                author: non_empty(get(6)),
                ahead: parse_track(track, "ahead"),
                behind: parse_track(track, "behind"),
                remote_only: false,
            }
        })
        .collect();

    // Append branches that exist only on a remote (no local ref yet).
    let local_names: std::collections::HashSet<String> =
        branches.iter().map(|b| b.name.clone()).collect();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let rfmt = "%(refname:short)%09%(objectname:short)%09%(committerdate:relative)%09%(committerdate:unix)%09%(authorname)";
    let rformat = format!("--format={rfmt}");
    let rout = git(dir, &["for-each-ref", "--sort=-committerdate", &rformat, "refs/remotes"])
        .unwrap_or_default();
    for line in rout.lines().filter(|l| !l.is_empty()) {
        let f: Vec<&str> = line.splitn(5, '\t').collect();
        let full = f.first().copied().unwrap_or("");
        if full.is_empty() || full.ends_with("/HEAD") {
            continue;
        }
        let name = match full.split_once('/') {
            Some((_, n)) => n.to_string(),
            None => continue,
        };
        if local_names.contains(&name) || seen.contains(&name) {
            continue;
        }
        seen.insert(name.clone());
        branches.push(Branch {
            name,
            current: false,
            upstream: Some(full.to_string()),
            last_commit: non_empty(f.get(1).copied().unwrap_or("")),
            last_commit_date: non_empty(f.get(2).copied().unwrap_or("")),
            last_commit_ts: f.get(3).and_then(|s| s.parse::<i64>().ok()),
            author: non_empty(f.get(4).copied().unwrap_or("")),
            ahead: 0,
            behind: 0,
            remote_only: true,
        });
    }
    branches
}

/// Fetch all remotes and prune deleted remote branches. Returns git's output.
pub fn fetch_remotes(dir: &str) -> Result<String, String> {
    let out = git_combined(dir, &["fetch", "--all", "--prune"])?;
    Ok(if out.is_empty() { "Already up to date.".to_string() } else { out })
}

pub fn list_worktrees(dir: &str) -> Vec<Worktree> {
    let out = match git(dir, &["worktree", "list", "--porcelain"]) {
        Ok(s) if !s.is_empty() => s,
        _ => return vec![],
    };
    let main_path = git(dir, &["rev-parse", "--show-toplevel"]).unwrap_or_default();
    let mut result = Vec::new();
    for block in out.split("\n\n").filter(|b| !b.trim().is_empty()) {
        let mut path = String::new();
        let mut branch: Option<String> = None;
        let mut head: Option<String> = None;
        let mut bare = false;
        let mut detached = false;
        let mut locked = false;
        for line in block.lines() {
            if let Some(p) = line.strip_prefix("worktree ") {
                path = p.to_string();
            } else if let Some(h) = line.strip_prefix("HEAD ") {
                head = Some(h.chars().take(8).collect());
            } else if let Some(b) = line.strip_prefix("branch ") {
                branch = Some(b.strip_prefix("refs/heads/").unwrap_or(b).to_string());
            } else if line == "bare" {
                bare = true;
            } else if line == "detached" {
                detached = true;
            } else if line.starts_with("locked") {
                locked = true;
            }
        }
        if path.is_empty() || !Path::new(&path).exists() {
            continue; // drop stale/prunable worktrees
        }
        let (ts, author) = head_meta(&path);
        let is_main = path == main_path;
        result.push(Worktree {
            path,
            branch,
            head,
            bare,
            detached,
            locked,
            is_main,
            last_commit_ts: ts,
            author,
        });
    }
    result
}

pub fn checkout(dir: &str, branch: &str) -> Result<(), String> {
    git(dir, &["checkout", branch]).map(|_| ())
}

pub fn pull(dir: &str) -> Result<String, String> {
    let out = git_combined(dir, &["pull"])?;
    Ok(if out.is_empty() { "Already up to date.".to_string() } else { out })
}

pub fn pull_branch(main_dir: &str, branch: &str, cwd: Option<&str>) -> Result<String, String> {
    let dir = cwd.unwrap_or(main_dir);
    if current_branch(dir).as_deref() == Some(branch) {
        return pull(dir);
    }
    // Non-checked-out branch: fast-forward its ref from the configured upstream.
    let refname = format!("refs/heads/{branch}");
    let info = git(
        main_dir,
        &["for-each-ref", "--format=%(upstream:remotename)%09%(upstream:short)", &refname],
    )
    .unwrap_or_default();
    let mut parts = info.splitn(2, '\t');
    let remote = parts.next().unwrap_or("");
    let upstream_short = parts.next().unwrap_or("");
    if remote.is_empty() || upstream_short.is_empty() {
        return Err("No upstream configured for this branch".to_string());
    }
    let prefix = format!("{remote}/");
    let remote_branch = upstream_short.strip_prefix(&prefix).unwrap_or(upstream_short);
    let refspec = format!("{remote_branch}:{branch}");
    let before = git(main_dir, &["rev-parse", branch]).unwrap_or_default();
    let out = git_combined(main_dir, &["fetch", remote, &refspec])?;
    let after = git(main_dir, &["rev-parse", branch]).unwrap_or_default();
    if !before.is_empty() && before == after {
        return Ok("Already up to date.".to_string());
    }
    Ok(if out.is_empty() { format!("Fast-forwarded {branch}.") } else { out })
}

fn non_empty(s: &str) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

fn parse_track(track: &str, key: &str) -> u32 {
    // track looks like "ahead 2, behind 1" (nobracket). Find "<key> <n>".
    if let Some(idx) = track.find(key) {
        let rest = &track[idx + key.len()..];
        let num: String = rest.trim_start().chars().take_while(|c| c.is_ascii_digit()).collect();
        num.parse().unwrap_or(0)
    } else {
        0
    }
}
