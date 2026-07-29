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
    /// True when the working tree has uncommitted changes (git status --porcelain).
    pub dirty: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub sha: String,
    pub short_sha: String,
    pub subject: String,
    pub author: Option<String>,
    pub ts: Option<i64>,
    pub date_rel: Option<String>,
    /// Number of parents (>1 = merge commit).
    pub parents: u32,
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
pub fn default_branch(dir: &str) -> Option<String> {
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
        let dirty = git(&path, &["status", "--porcelain"])
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
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
            dirty,
        });
    }
    result
}

/// Create a worktree for an existing branch (no `-b`, unlike task-force
/// creation which forges a fresh branch). Path is
/// `worktree_root/slug(project)/slug(branch)`; parent dirs are created first.
/// The `--` separator keeps a flag-shaped `branch` from being parsed as a git
/// flag, matching `factory::create_task_force`'s convention.
///
/// `branch` may be a remote-only branch (no local ref yet — see
/// `Branch::remote_only`), which `git worktree add` resolves the same way
/// `git checkout` does: if it matches exactly one `refs/remotes/<remote>/branch`,
/// it DWIMs a new local branch tracking it. That's the desired behavior and is
/// left to git itself. But if the short name matches more than one remote
/// (e.g. both `origin/foo` and `upstream/foo` exist and neither is checked out
/// locally), git's DWIM refuses and fails with an opaque "invalid reference"
/// error that doesn't explain why — surfaced verbatim it would just look like
/// a broken branch name. Detect that ambiguity up front so the error the UI
/// toasts actually says what's wrong, rather than creating nothing and giving
/// no clue, or (in principle, on some git versions/configs) resolving to
/// whichever remote happens to sort first.
pub fn add_worktree_for_branch(
    repo_dir: &Path,
    worktree_root: &Path,
    project: &str,
    branch: &str,
) -> Result<Worktree, String> {
    let repo = repo_dir.to_string_lossy().to_string();

    let has_local_branch =
        git(&repo, &["rev-parse", "--verify", "--quiet", &format!("refs/heads/{branch}")]).is_ok();
    if !has_local_branch {
        let remotes_out = git(&repo, &["for-each-ref", "--format=%(refname:short)", &format!("refs/remotes/*/{branch}")])
            .unwrap_or_default();
        let remotes: Vec<&str> = remotes_out.lines().filter(|l| !l.is_empty()).collect();
        if remotes.len() > 1 {
            return Err(format!(
                "'{branch}' exists on multiple remotes ({}) and has no local branch yet — check one out explicitly first, e.g. `git checkout -b {branch} {}`",
                remotes.join(", "),
                remotes[0],
            ));
        }
    }

    let path = worktree_root
        .join(crate::factory::slugify(project))
        .join(crate::factory::slugify(branch));
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let wt = path.to_string_lossy().to_string();
    git(&repo, &["worktree", "add", "--", &wt, branch]).map_err(|e| format!("git worktree add failed: {e}"))?;

    // `git worktree list` reports canonicalized paths (e.g. macOS resolves
    // /var -> /private/var), so compare canonical forms rather than the raw
    // strings, falling back to a raw compare if canonicalization fails.
    let canonical_path = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
    let found = list_worktrees(&repo)
        .into_iter()
        .find(|w| {
            let wp = Path::new(&w.path);
            wp == path
                || std::fs::canonicalize(wp)
                    .map(|c| c == canonical_path)
                    .unwrap_or(false)
        });
    Ok(found.unwrap_or_else(|| {
        let (ts, author) = head_meta(&wt);
        let dirty = git(&wt, &["status", "--porcelain"])
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        Worktree {
            path: wt,
            branch: Some(branch.to_string()),
            head: None,
            bare: false,
            detached: false,
            locked: false,
            is_main: false,
            last_commit_ts: ts,
            author,
            dirty,
        }
    }))
}

/// Create a worktree for a brand-new branch forged off `base` (`git worktree
/// add -b <new_branch> -- <path> <base>`, unlike `add_worktree_for_branch`
/// which checks out an existing branch). Used by the "New session" flow,
/// which lets the user pick only a base branch to branch off — Kablan
/// generates the new branch name itself. Path is
/// `worktree_root/slug(project)/slug(new_branch)`; parent dirs are created
/// first. The `--` separator keeps a flag-shaped `new_branch`/`base` from
/// being parsed as a git flag, matching `add_worktree_for_branch`'s
/// convention.
pub fn create_worktree_new_branch(
    repo_dir: &Path,
    worktree_root: &Path,
    project: &str,
    new_branch: &str,
    base: &str,
) -> Result<Worktree, String> {
    let repo = repo_dir.to_string_lossy().to_string();

    let path = worktree_root
        .join(crate::factory::slugify(project))
        .join(crate::factory::slugify(new_branch));
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let wt = path.to_string_lossy().to_string();
    git(&repo, &["worktree", "add", "-b", new_branch, "--", &wt, base])
        .map_err(|e| format!("git worktree add failed: {e}"))?;

    // See `add_worktree_for_branch`'s matching comment: compare canonical
    // paths, since `git worktree list` reports macOS's resolved /private/var form.
    let canonical_path = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
    let found = list_worktrees(&repo)
        .into_iter()
        .find(|w| {
            let wp = Path::new(&w.path);
            wp == path
                || std::fs::canonicalize(wp)
                    .map(|c| c == canonical_path)
                    .unwrap_or(false)
        });
    Ok(found.unwrap_or_else(|| {
        let (ts, author) = head_meta(&wt);
        let dirty = git(&wt, &["status", "--porcelain"])
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        Worktree {
            path: wt,
            branch: Some(new_branch.to_string()),
            head: None,
            bare: false,
            detached: false,
            locked: false,
            is_main: false,
            last_commit_ts: ts,
            author,
            dirty,
        }
    }))
}

/// Return the existing worktree for `branch` if one is already checked out
/// (scanning `list_worktrees`), else create one via `add_worktree_for_branch`.
/// Used by the branch-centric agent-start flow so starting an agent twice on
/// the same branch reuses its working copy instead of erroring.
pub fn ensure_worktree_for_branch(
    repo_dir: &Path,
    worktree_root: &Path,
    project: &str,
    branch: &str,
) -> Result<Worktree, String> {
    let repo = repo_dir.to_string_lossy().to_string();
    if let Some(existing) = list_worktrees(&repo).into_iter().find(|w| w.branch.as_deref() == Some(branch)) {
        return Ok(existing);
    }
    add_worktree_for_branch(repo_dir, worktree_root, project, branch)
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

/// Recent commits for a ref (default HEAD). For the timeline/graph view.
pub fn list_commits(dir: &str, reff: Option<&str>, limit: u32) -> Vec<Commit> {
    let target = reff.unwrap_or("HEAD");
    let fmt = "%H%x1f%h%x1f%s%x1f%an%x1f%ct%x1f%p";
    let format_arg = format!("--format={fmt}");
    let max_count = format!("--max-count={limit}");
    let out = match git(dir, &["log", &format_arg, &max_count, target]) {
        Ok(s) if !s.is_empty() => s,
        _ => return vec![],
    };
    out.lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let f: Vec<&str> = line.split('\u{1f}').collect();
            let get = |i: usize| f.get(i).copied().unwrap_or("");
            let ts = get(4).parse::<i64>().ok();
            let parents = get(5).split_whitespace().filter(|s| !s.is_empty()).count() as u32;
            Commit {
                sha: get(0).to_string(),
                short_sha: get(1).to_string(),
                subject: get(2).to_string(),
                author: non_empty(get(3)),
                ts,
                date_rel: None,
                parents,
            }
        })
        .collect()
}

/// Unified diff. With `sha`, shows that commit; otherwise the working-tree changes vs HEAD.
pub fn get_diff(dir: &str, sha: Option<&str>) -> String {
    let args: Vec<&str> = match sha {
        Some(s) => vec!["show", "--no-color", "--stat", "--patch", s],
        None => vec!["diff", "--no-color", "HEAD"],
    };
    git(dir, &args).unwrap_or_default()
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn tmp() -> std::path::PathBuf {
        let mut p = env::temp_dir();
        let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        p.push(format!("kablan-git-test-{n}"));
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    fn init_repo() -> std::path::PathBuf {
        let dir = tmp();
        let d = dir.to_string_lossy().to_string();
        git(&d, &["init", "-b", "main"]).unwrap();
        git(&d, &["config", "user.email", "t@t.co"]).unwrap();
        git(&d, &["config", "user.name", "t"]).unwrap();
        std::fs::write(dir.join("README.md"), "hi").unwrap();
        git(&d, &["add", "."]).unwrap();
        git(&d, &["commit", "-m", "init"]).unwrap();
        dir
    }

    #[test]
    fn add_worktree_for_branch_creates_dir_and_shows_in_list() {
        let repo = init_repo();
        let d = repo.to_string_lossy().to_string();
        // an existing branch, no `-b`
        git(&d, &["branch", "feature/existing"]).unwrap();
        let wt_root = tmp();

        let wt = add_worktree_for_branch(&repo, &wt_root, "acme/app", "feature/existing").unwrap();

        assert!(Path::new(&wt.path).exists(), "worktree dir should exist");
        assert_eq!(wt.branch.as_deref(), Some("feature/existing"));
        assert!(!wt.is_main);

        let all = list_worktrees(&d);
        assert!(all.iter().any(|w| w.path == wt.path), "list_worktrees should include the new worktree");
    }

    #[test]
    fn add_worktree_for_branch_uses_slugified_project_and_branch_path() {
        let repo = init_repo();
        let d = repo.to_string_lossy().to_string();
        // valid git ref, but needs slugifying: "/" and "_" collapse to "-".
        git(&d, &["branch", "Feature/Cool_Thing"]).unwrap();
        let wt_root = tmp();

        let wt = add_worktree_for_branch(&repo, &wt_root, "Acme App", "Feature/Cool_Thing").unwrap();

        let expected = std::fs::canonicalize(&wt_root).unwrap().join("acme-app").join("feature-cool-thing");
        assert_eq!(std::fs::canonicalize(&wt.path).unwrap(), expected);
    }

    #[test]
    fn create_worktree_new_branch_forges_branch_and_shows_in_list() {
        let repo = init_repo();
        let d = repo.to_string_lossy().to_string();
        let wt_root = tmp();

        let wt = create_worktree_new_branch(&repo, &wt_root, "acme/app", "session/abc123", "main").unwrap();

        assert!(Path::new(&wt.path).exists(), "worktree dir should exist");
        assert_eq!(wt.branch.as_deref(), Some("session/abc123"));
        assert!(!wt.is_main);

        let all = list_worktrees(&d);
        assert!(
            all.iter().any(|w| w.path == wt.path && w.branch.as_deref() == Some("session/abc123")),
            "list_worktrees should show the new worktree on the new branch"
        );
    }

    #[test]
    fn create_worktree_new_branch_uses_slugified_project_and_branch_path() {
        let repo = init_repo();
        let wt_root = tmp();

        let wt = create_worktree_new_branch(&repo, &wt_root, "Acme App", "session/Abc_123", "main").unwrap();

        let expected = std::fs::canonicalize(&wt_root).unwrap().join("acme-app").join("session-abc-123");
        assert_eq!(std::fs::canonicalize(&wt.path).unwrap(), expected);
    }

    #[test]
    fn create_worktree_new_branch_unknown_base_errors() {
        let repo = init_repo();
        let wt_root = tmp();
        let r = create_worktree_new_branch(&repo, &wt_root, "acme/app", "session/abc123", "does-not-exist");
        assert!(r.is_err());
    }

    #[test]
    fn ensure_worktree_for_branch_creates_then_reuses() {
        let repo = init_repo();
        let d = repo.to_string_lossy().to_string();
        git(&d, &["branch", "feature/existing"]).unwrap();
        let wt_root = tmp();

        let first = ensure_worktree_for_branch(&repo, &wt_root, "acme/app", "feature/existing").unwrap();
        assert!(Path::new(&first.path).exists());

        // Second call must find the already-checked-out worktree, not error
        // (git refuses to `worktree add` a branch that's already checked out).
        let second = ensure_worktree_for_branch(&repo, &wt_root, "acme/app", "feature/existing").unwrap();
        assert_eq!(second.path, first.path);
        assert_eq!(second.branch.as_deref(), Some("feature/existing"));
    }

    #[test]
    fn add_worktree_for_branch_unknown_branch_errors() {
        let repo = init_repo();
        let wt_root = tmp();
        let r = add_worktree_for_branch(&repo, &wt_root, "acme/app", "does-not-exist");
        assert!(r.is_err());
    }

    #[test]
    fn add_worktree_for_branch_rejects_flag_shaped_branch() {
        // `--` separator must stop a flag-shaped branch name from being
        // parsed as a git flag (mirrors factory::create_task_force's test).
        let repo = init_repo();
        let wt_root = tmp();
        let r = add_worktree_for_branch(&repo, &wt_root, "acme/app", "--detach");
        assert!(r.is_err(), "flag-shaped branch should fail, not be parsed as a git flag");
    }

    /// Clones `origin` into a fresh dir so the clone has a `refs/remotes/origin/*`
    /// but no local branches of its own beyond the default one checked out.
    fn clone_repo(origin: &std::path::Path) -> std::path::PathBuf {
        let dir = tmp();
        // `tmp()` already created `dir`; `git clone` needs to create it itself.
        std::fs::remove_dir_all(&dir).unwrap();
        git(
            &env::current_dir().unwrap().to_string_lossy(),
            &["clone", "-q", &origin.to_string_lossy(), &dir.to_string_lossy()],
        )
        .unwrap();
        dir
    }

    #[test]
    fn add_worktree_for_branch_remote_only_single_remote_dwims_a_tracking_branch() {
        // A branch that exists only on `origin` (never checked out locally) should
        // resolve the same way `git checkout <branch>` does: DWIM a local branch
        // tracking the sole matching remote, not error and not track the wrong ref.
        let origin = init_repo();
        git(&origin.to_string_lossy(), &["checkout", "-qb", "feature-remote"]).unwrap();
        git(&origin.to_string_lossy(), &["checkout", "-q", "main"]).unwrap();

        let repo = clone_repo(&origin);
        let wt_root = tmp();

        let wt = add_worktree_for_branch(&repo, &wt_root, "acme/app", "feature-remote")
            .expect("single-remote DWIM should succeed, not error");

        assert_eq!(wt.branch.as_deref(), Some("feature-remote"));
        assert!(Path::new(&wt.path).exists());
        let upstream = git(&wt.path, &["rev-parse", "--abbrev-ref", "feature-remote@{upstream}"]).unwrap();
        assert_eq!(upstream, "origin/feature-remote");
    }

    #[test]
    fn add_worktree_for_branch_ambiguous_across_remotes_errors_clearly() {
        // Two remotes both have a same-named branch, and neither is checked out
        // locally: git's own DWIM would fail with an opaque "invalid reference"
        // message. `add_worktree_for_branch` should instead fail with a message
        // that actually explains the ambiguity, and must not silently create a
        // worktree tracking whichever remote it happened to pick.
        let origin = init_repo();
        git(&origin.to_string_lossy(), &["checkout", "-qb", "feature-shared"]).unwrap();
        git(&origin.to_string_lossy(), &["checkout", "-q", "main"]).unwrap();

        let other_remote = init_repo();
        git(&other_remote.to_string_lossy(), &["checkout", "-qb", "feature-shared"]).unwrap();
        git(&other_remote.to_string_lossy(), &["checkout", "-q", "main"]).unwrap();

        let repo = clone_repo(&origin);
        let d = repo.to_string_lossy().to_string();
        git(&d, &["remote", "add", "upstream", &other_remote.to_string_lossy()]).unwrap();
        git(&d, &["fetch", "-q", "upstream"]).unwrap();

        let wt_root = tmp();
        let r = add_worktree_for_branch(&repo, &wt_root, "acme/app", "feature-shared");

        let err = r.expect_err("ambiguous remote-only branch should error, not DWIM to one silently");
        assert!(
            err.contains("multiple remotes") && err.contains("origin/feature-shared") && err.contains("upstream/feature-shared"),
            "error should name the ambiguity and the candidate remotes, got: {err}"
        );
        assert!(
            list_worktrees(&d).iter().all(|w| w.branch.as_deref() != Some("feature-shared")),
            "no worktree should have been created for the ambiguous branch"
        );
    }
}
