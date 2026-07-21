//! Project scanning, dev-command detection, env files, and path guards —
//! mirrors server/projects.ts.
use crate::config;
use crate::git;
use serde::Serialize;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub name: String,
    pub path: String,
    pub current_branch: Option<String>,
    pub detected_command: Option<String>,
    pub dev_command: String,
    pub has_env: bool,
    pub package_manager: String,
    pub last_commit_ts: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct EnvFile {
    pub name: String,
    pub exists: bool,
    pub content: String,
}

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache",
    "coverage",
    "vendor",
];

fn detect_package_manager(dir: &Path) -> String {
    if dir.join("pnpm-lock.yaml").exists() {
        "pnpm".into()
    } else if dir.join("yarn.lock").exists() {
        "yarn".into()
    } else if dir.join("bun.lockb").exists() || dir.join("bun.lock").exists() {
        "bun".into()
    } else {
        "npm".into()
    }
}

fn run_script(pm: &str, script: &str) -> String {
    if pm == "npm" {
        format!("npm run {script}")
    } else {
        format!("{pm} {script}")
    }
}

pub fn detect_dev_command(dir: &Path) -> Option<String> {
    let pkg_path = dir.join("package.json");
    if !pkg_path.exists() {
        return None;
    }
    let raw = std::fs::read_to_string(&pkg_path).ok()?;
    let pkg: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let scripts = pkg.get("scripts");
    let pm = detect_package_manager(dir);
    for candidate in config::load().dev_script_priority {
        let has = scripts
            .and_then(|s| s.get(&candidate))
            .map(|v| !v.is_null())
            .unwrap_or(false);
        if has {
            return Some(run_script(&pm, &candidate));
        }
    }
    None
}

pub fn resolve_dev_command(dir: &Path) -> String {
    let cfg = config::load();
    if let Some(ov) = cfg.overrides.get(&dir.to_string_lossy().to_string()) {
        if let Some(cmd) = &ov.dev_command {
            if !cmd.trim().is_empty() {
                return cmd.trim().to_string();
            }
        }
    }
    detect_dev_command(dir).unwrap_or_else(|| "npm run dev".to_string())
}

fn walk(dir: &Path, depth: u32, max_depth: u32, found: &mut Vec<PathBuf>) {
    if dir.join(".git").exists() {
        found.push(dir.to_path_buf());
        return;
    }
    if depth >= max_depth {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        walk(&path, depth + 1, max_depth, found);
    }
}

fn find_git_repos(root: &Path, max_depth: u32) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return found,
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        walk(&path, 1, max_depth, &mut found);
    }
    found
}

pub fn list_projects() -> Vec<ProjectSummary> {
    let cfg = config::load();
    let parent = PathBuf::from(&cfg.parent_dir);
    if !parent.exists() {
        return vec![];
    }
    let repos = find_git_repos(&parent, cfg.max_scan_depth.max(1));
    let mut out: Vec<ProjectSummary> = Vec::new();
    for dir in repos {
        let has_pkg = dir.join("package.json").exists();
        if !has_pkg && !cfg.show_non_node_projects {
            continue;
        }
        let dir_str = dir.to_string_lossy().to_string();
        let detected = detect_dev_command(&dir);
        let pm = detect_package_manager(&dir);
        let current_branch = git::current_branch(&dir_str);
        let last_commit_ts = git::last_commit_ts(&dir_str);
        let name = dir
            .strip_prefix(&parent)
            .map(|p| p.components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/"))
            .unwrap_or_else(|_| dir_str.clone());
        let has_env = cfg.env_files.iter().any(|f| dir.join(f).exists());
        out.push(ProjectSummary {
            name,
            path: dir_str,
            current_branch,
            detected_command: detected.clone(),
            dev_command: resolve_dev_command(&dir),
            has_env,
            package_manager: pm,
            last_commit_ts,
        });
    }
    // Most recently changed first; repos with no commits sink to the bottom; ties by name.
    out.sort_by(|a, b| {
        let ta = a.last_commit_ts.unwrap_or(i64::MIN);
        let tb = b.last_commit_ts.unwrap_or(i64::MIN);
        tb.cmp(&ta).then_with(|| a.name.cmp(&b.name))
    });
    out
}

pub fn read_env_files(dir: &str) -> Vec<EnvFile> {
    config::load()
        .env_files
        .iter()
        .map(|name| {
            let p = Path::new(dir).join(name);
            let exists = p.exists();
            let content = if exists {
                std::fs::read_to_string(&p).unwrap_or_default()
            } else {
                String::new()
            };
            EnvFile {
                name: name.clone(),
                exists,
                content,
            }
        })
        .collect()
}

pub fn write_env_file(dir: &str, name: &str, content: &str) -> Result<(), String> {
    if !config::load().env_files.iter().any(|f| f == name) {
        return Err(format!("Refusing to write unknown env file: {name}"));
    }
    std::fs::write(Path::new(dir).join(name), content).map_err(|e| e.to_string())
}

/// Lexically normalise a path (collapse "." and ".."), like Node's path.normalize.
fn normalize(path: &Path) -> PathBuf {
    let mut out: Vec<Component> = Vec::new();
    for comp in path.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => match out.last() {
                Some(Component::Normal(_)) => {
                    out.pop();
                }
                Some(Component::RootDir) | Some(Component::Prefix(_)) => {}
                _ => out.push(comp),
            },
            c => out.push(c),
        }
    }
    out.iter().collect()
}

/// Absolute, normalised path (relative inputs resolved against the process cwd) —
/// mirrors Node's path.resolve.
fn resolve_abs(p: &str) -> PathBuf {
    let path = Path::new(p);
    let joined = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_default().join(path)
    };
    normalize(&joined)
}

/// Resolve a project path from its (possibly nested) name, guarding against traversal.
pub fn project_path_from_name(name: &str) -> Result<String, String> {
    let cfg = config::load();
    let parent = resolve_abs(&cfg.parent_dir);
    let dir = normalize(&parent.join(name));
    if dir.starts_with(&parent) {
        Ok(dir.to_string_lossy().to_string())
    } else {
        Err("Invalid project name".to_string())
    }
}

/// Resolve a working dir: the main repo or one of its worktrees. Rejects arbitrary paths.
pub fn resolve_workdir(name: &str, cwd: Option<&str>) -> Result<String, String> {
    let main = project_path_from_name(name)?;
    let main_abs = resolve_abs(&main);
    match cwd {
        None => Ok(main),
        Some(c) if c.is_empty() => Ok(main),
        Some(c) => {
            let target = resolve_abs(c);
            if target == main_abs {
                return Ok(main);
            }
            let worktrees = git::list_worktrees(&main);
            if worktrees.iter().any(|w| resolve_abs(&w.path) == target) {
                Ok(target.to_string_lossy().to_string())
            } else {
                Err("Directory is not a worktree of this project".to_string())
            }
        }
    }
}
