//! Agent Factory store: features + task forces persisted to ~/.kablan/factory.json.
//! Core functions take injected paths so they unit-test without global config.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use crate::git;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskForce {
    pub id: String,
    pub name: String,
    pub branch: String,
    pub base_branch: String,
    pub worktree_path: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub linear_ticket: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Feature {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub task_forces: Vec<TaskForce>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFactory {
    #[serde(default)]
    pub features: Vec<Feature>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FactoryFile {
    #[serde(default)]
    pub projects: BTreeMap<String, ProjectFactory>,
}

/// Lowercase alphanumeric slug; runs of other chars collapse to a single dash.
pub fn slugify(s: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for c in s.trim().to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            prev_dash = false;
        } else if !out.is_empty() && !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() {
        "item".to_string()
    } else {
        out
    }
}

fn unique_id(base: &str, existing: &[String]) -> String {
    if !existing.iter().any(|e| e == base) {
        return base.to_string();
    }
    let mut n = 2;
    loop {
        let cand = format!("{base}-{n}");
        if !existing.iter().any(|e| e == &cand) {
            return cand;
        }
        n += 1;
    }
}

pub fn load_file(path: &Path) -> FactoryFile {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_file(path: &Path, file: &FactoryFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let s = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    fs::write(path, s).map_err(|e| e.to_string())
}

pub fn create_feature(file: &mut FactoryFile, project: &str, name: &str) -> Result<Feature, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Feature name is required".to_string());
    }
    let pf = file.projects.entry(project.to_string()).or_default();
    let ids: Vec<String> = pf.features.iter().map(|f| f.id.clone()).collect();
    let id = unique_id(&slugify(name), &ids);
    let feat = Feature { id, name: name.to_string(), task_forces: Vec::new() };
    pf.features.push(feat.clone());
    Ok(feat)
}

pub struct CreateTfArgs {
    pub name: String,
    pub base_branch: String,
    pub linear_ticket: Option<String>,
}

#[allow(clippy::too_many_arguments)]
pub fn create_task_force(
    file: &mut FactoryFile,
    project: &str,
    feature_id: &str,
    args: CreateTfArgs,
    repo_dir: &Path,
    worktree_root: &Path,
    branch_pattern: &str,
    created_at: i64,
) -> Result<TaskForce, String> {
    let name = args.name.trim();
    if name.is_empty() {
        return Err("Task force name is required".to_string());
    }
    let base = args.base_branch.trim();
    if base.is_empty() {
        return Err("Base branch is required".to_string());
    }
    let pf = file.projects.get_mut(project).ok_or("Unknown project")?;
    let feat = pf
        .features
        .iter_mut()
        .find(|f| f.id == feature_id)
        .ok_or("Unknown feature")?;

    let tf_ids: Vec<String> = feat.task_forces.iter().map(|t| t.id.clone()).collect();
    let id = unique_id(&slugify(name), &tf_ids);
    let branch = branch_pattern
        .replace("{feature}", &feat.id)
        .replace("{task}", &id);
    let worktree_path = worktree_root.join(slugify(project)).join(&id);
    let wt = worktree_path.to_string_lossy().to_string();

    // create-new only: a fresh branch off base at a fresh worktree path.
    git::git(
        &repo_dir.to_string_lossy(),
        &["worktree", "add", "-b", &branch, &wt, base],
    )
    .map_err(|e| format!("git worktree add failed: {e}"))?;

    let tf = TaskForce {
        id,
        name: name.to_string(),
        branch,
        base_branch: base.to_string(),
        worktree_path: wt,
        linear_ticket: args.linear_ticket.filter(|s| !s.trim().is_empty()),
        created_at,
    };
    feat.task_forces.push(tf.clone());
    Ok(tf)
}

pub fn delete_task_force(
    file: &mut FactoryFile,
    project: &str,
    tf_id: &str,
    repo_dir: &Path,
    remove_worktree: bool,
) -> Result<(), String> {
    let pf = file.projects.get_mut(project).ok_or("Unknown project")?;
    let mut removed: Option<TaskForce> = None;
    for feat in pf.features.iter_mut() {
        if let Some(pos) = feat.task_forces.iter().position(|t| t.id == tf_id) {
            removed = Some(feat.task_forces.remove(pos));
            break;
        }
    }
    let tf = removed.ok_or("Unknown task force")?;
    if remove_worktree {
        // best-effort: ignore errors (worktree may already be gone)
        let _ = git::git(
            &repo_dir.to_string_lossy(),
            &["worktree", "remove", "--force", &tf.worktree_path],
        );
    }
    Ok(())
}

/// Ids of task forces whose worktree directory no longer exists on disk.
pub fn orphaned_task_forces(file: &FactoryFile, project: &str) -> Vec<String> {
    let Some(pf) = file.projects.get(project) else {
        return Vec::new();
    };
    pf.features
        .iter()
        .flat_map(|f| &f.task_forces)
        .filter(|t| !Path::new(&t.worktree_path).exists())
        .map(|t| t.id.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn tmp() -> std::path::PathBuf {
        // unique temp dir without external crates
        let mut p = env::temp_dir();
        let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        p.push(format!("kablan-factory-test-{n}"));
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    fn init_repo() -> std::path::PathBuf {
        let dir = tmp();
        let d = dir.to_string_lossy().to_string();
        crate::git::git(&d, &["init", "-b", "main"]).unwrap();
        crate::git::git(&d, &["config", "user.email", "t@t.co"]).unwrap();
        crate::git::git(&d, &["config", "user.name", "t"]).unwrap();
        std::fs::write(dir.join("README.md"), "hi").unwrap();
        crate::git::git(&d, &["add", "."]).unwrap();
        crate::git::git(&d, &["commit", "-m", "init"]).unwrap();
        dir
    }

    #[test]
    fn slugify_basic() {
        assert_eq!(slugify("Audit Log v2!"), "audit-log-v2");
        assert_eq!(slugify("  --Weird__Name--  "), "weird-name");
        assert_eq!(slugify(""), "item");
    }

    #[test]
    fn load_missing_file_is_empty() {
        let f = load_file(&tmp().join("nope.json"));
        assert!(f.projects.is_empty());
    }

    #[test]
    fn create_feature_and_roundtrip() {
        let path = tmp().join("factory.json");
        let mut file = load_file(&path);
        let feat = create_feature(&mut file, "acme/app", "Audit Log v2").unwrap();
        assert_eq!(feat.id, "audit-log-v2");
        assert_eq!(feat.name, "Audit Log v2");
        assert!(feat.task_forces.is_empty());
        save_file(&path, &file).unwrap();

        let reloaded = load_file(&path);
        assert_eq!(reloaded.projects["acme/app"].features.len(), 1);
        assert_eq!(reloaded.projects["acme/app"].features[0].id, "audit-log-v2");
    }

    #[test]
    fn feature_ids_dedup_within_project() {
        let mut file = FactoryFile::default();
        let a = create_feature(&mut file, "p", "Login").unwrap();
        let b = create_feature(&mut file, "p", "Login").unwrap();
        assert_eq!(a.id, "login");
        assert_eq!(b.id, "login-2");
    }

    #[test]
    fn empty_feature_name_rejected() {
        let mut file = FactoryFile::default();
        assert!(create_feature(&mut file, "p", "   ").is_err());
    }

    #[test]
    fn create_task_force_makes_branch_and_worktree() {
        let repo = init_repo();
        let wt_root = tmp();
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "acme/app", "Audit").unwrap();
        let tf = create_task_force(
            &mut file, "acme/app", &feat.id,
            CreateTfArgs { name: "Details Drawer".into(), base_branch: "main".into(), linear_ticket: Some("FE-1".into()) },
            &repo, &wt_root, "feat/{feature}-{task}", 1234,
        ).unwrap();

        assert_eq!(tf.id, "details-drawer");
        assert_eq!(tf.branch, "feat/audit-details-drawer");
        assert_eq!(tf.base_branch, "main");
        assert_eq!(tf.linear_ticket.as_deref(), Some("FE-1"));
        assert_eq!(tf.created_at, 1234);
        assert!(Path::new(&tf.worktree_path).exists(), "worktree dir should exist");
        // branch exists in the repo
        let branches = crate::git::git(&repo.to_string_lossy(), &["branch", "--list", &tf.branch]).unwrap();
        assert!(branches.contains(&tf.branch));
        // recorded under the feature
        assert_eq!(file.projects["acme/app"].features[0].task_forces.len(), 1);
    }

    #[test]
    fn create_task_force_unknown_feature_errors() {
        let repo = init_repo();
        let wt_root = tmp();
        let mut file = FactoryFile::default();
        let r = create_task_force(
            &mut file, "acme/app", "nope",
            CreateTfArgs { name: "x".into(), base_branch: "main".into(), linear_ticket: None },
            &repo, &wt_root, "feat/{feature}-{task}", 1,
        );
        assert!(r.is_err());
    }

    #[test]
    fn delete_task_force_removes_record_and_worktree() {
        let repo = init_repo();
        let wt_root = tmp();
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "acme/app", "Audit").unwrap();
        let tf = create_task_force(
            &mut file, "acme/app", &feat.id,
            CreateTfArgs { name: "drawer".into(), base_branch: "main".into(), linear_ticket: None },
            &repo, &wt_root, "feat/{feature}-{task}", 1,
        ).unwrap();
        let wt = tf.worktree_path.clone();
        delete_task_force(&mut file, "acme/app", &tf.id, &repo, true).unwrap();
        assert!(file.projects["acme/app"].features[0].task_forces.is_empty());
        assert!(!Path::new(&wt).exists(), "worktree dir should be gone");
    }

    #[test]
    fn orphaned_lists_missing_worktrees() {
        let repo = init_repo();
        let wt_root = tmp();
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "acme/app", "Audit").unwrap();
        let tf = create_task_force(
            &mut file, "acme/app", &feat.id,
            CreateTfArgs { name: "drawer".into(), base_branch: "main".into(), linear_ticket: None },
            &repo, &wt_root, "feat/{feature}-{task}", 1,
        ).unwrap();

        assert!(orphaned_task_forces(&file, "acme/app").is_empty());
        // Simulate an externally-removed worktree dir.
        std::fs::remove_dir_all(&tf.worktree_path).unwrap();
        assert_eq!(orphaned_task_forces(&file, "acme/app"), vec![tf.id.clone()]);
    }

    #[test]
    fn orphaned_unknown_project_is_empty() {
        let file = FactoryFile::default();
        assert!(orphaned_task_forces(&file, "nope").is_empty());
    }
}
