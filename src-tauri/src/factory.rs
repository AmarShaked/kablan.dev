//! Agent Factory store: features + task forces persisted to ~/.kablan/factory.json.
//! Core functions take injected paths so they unit-test without global config.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use crate::git;
use crate::agents::AgentStatus;

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
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agent_session_id: Option<String>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxEntry {
    pub project: String,
    pub feature_id: String,
    pub feature_name: String,
    pub task_force_id: String,
    pub task_force_name: String,
    pub branch: String,
    pub status: String,
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
    // `--` separates flags from positionals so a flag-shaped `wt` or `base`
    // (e.g. base_branch: "--detach") can't be parsed as a git flag.
    git::git(
        &repo_dir.to_string_lossy(),
        &["worktree", "add", "-b", &branch, "--", &wt, base],
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
        agent_session_id: None,
    };
    feat.task_forces.push(tf.clone());
    Ok(tf)
}

/// Find the task force across all features in `project` and set its stored
/// agent session id (used to `--resume` after a relaunch).
pub fn set_agent_session(file: &mut FactoryFile, project: &str, tf_id: &str, sid: &str) -> Result<(), String> {
    let pf = file.projects.get_mut(project).ok_or("Unknown project")?;
    for feat in pf.features.iter_mut() {
        if let Some(tf) = feat.task_forces.iter_mut().find(|t| t.id == tf_id) {
            tf.agent_session_id = Some(sid.to_string());
            return Ok(());
        }
    }
    Err("Unknown task force".to_string())
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
        // best-effort: ignore errors (worktree may already be gone).
        // `--` separates flags from the positional path (see create_task_force).
        let _ = git::git(
            &repo_dir.to_string_lossy(),
            &["worktree", "remove", "--force", "--", &tf.worktree_path],
        );
        // Also best-effort delete the branch so a delete -> re-create cycle
        // with the same name doesn't collide with the still-existing branch.
        let _ = git::git(&repo_dir.to_string_lossy(), &["branch", "-D", &tf.branch]);
    }
    Ok(())
}

/// Find a task force across all features in `project` by id.
pub fn find_task_force<'a>(file: &'a FactoryFile, project: &str, tf_id: &str) -> Option<&'a TaskForce> {
    file.projects
        .get(project)?
        .features
        .iter()
        .flat_map(|f| &f.task_forces)
        .find(|t| t.id == tf_id)
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

/// Build the global inbox: list of task forces needing attention (AwaitingInput or Failed).
/// Deterministic order: projects (BTreeMap order), features (list order), task forces (list order).
pub fn build_inbox(file: &FactoryFile, statuses: &BTreeMap<String, AgentStatus>) -> Vec<InboxEntry> {
    let mut entries = Vec::new();
    for (project, pf) in file.projects.iter() {
        for feat in pf.features.iter() {
            for tf in feat.task_forces.iter() {
                let key = format!("{project}::{}", tf.id);
                if let Some(status) = statuses.get(&key) {
                    let status_str = match status {
                        AgentStatus::AwaitingInput => "awaitingInput",
                        AgentStatus::Failed => "failed",
                        _ => continue,
                    };
                    entries.push(InboxEntry {
                        project: project.clone(),
                        feature_id: feat.id.clone(),
                        feature_name: feat.name.clone(),
                        task_force_id: tf.id.clone(),
                        task_force_name: tf.name.clone(),
                        branch: tf.branch.clone(),
                        status: status_str.to_string(),
                    });
                }
            }
        }
    }
    entries
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

    #[test]
    fn create_task_force_rejects_flag_shaped_base_branch() {
        // A base_branch like "--detach" must not be parsed as a git flag: the
        // `--` separator in the worktree-add args forces it to be treated as
        // a (bad) commit-ish, so git errors out instead of doing something
        // unexpected with the flag.
        let repo = init_repo();
        let wt_root = tmp();
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "acme/app", "Audit").unwrap();
        let r = create_task_force(
            &mut file, "acme/app", &feat.id,
            CreateTfArgs { name: "drawer".into(), base_branch: "--detach".into(), linear_ticket: None },
            &repo, &wt_root, "feat/{feature}-{task}", 1,
        );
        assert!(r.is_err(), "flag-shaped base_branch should fail, not be parsed as a git flag");
    }

    #[test]
    fn set_agent_session_then_read_back() {
        let repo = init_repo();
        let wt_root = tmp();
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "acme/app", "Audit").unwrap();
        let tf = create_task_force(
            &mut file, "acme/app", &feat.id,
            CreateTfArgs { name: "drawer".into(), base_branch: "main".into(), linear_ticket: None },
            &repo, &wt_root, "feat/{feature}-{task}", 1,
        ).unwrap();
        assert!(tf.agent_session_id.is_none());

        set_agent_session(&mut file, "acme/app", &tf.id, "sess-42").unwrap();

        let stored = &file.projects["acme/app"].features[0].task_forces[0];
        assert_eq!(stored.agent_session_id.as_deref(), Some("sess-42"));
    }

    #[test]
    fn set_agent_session_unknown_task_force_errors() {
        let mut file = FactoryFile::default();
        create_feature(&mut file, "acme/app", "Audit").unwrap();
        assert!(set_agent_session(&mut file, "acme/app", "nope", "sess").is_err());
    }

    #[test]
    fn delete_then_recreate_same_name_succeeds() {
        let repo = init_repo();
        let wt_root = tmp();
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "acme/app", "Audit").unwrap();
        let tf1 = create_task_force(
            &mut file, "acme/app", &feat.id,
            CreateTfArgs { name: "drawer".into(), base_branch: "main".into(), linear_ticket: None },
            &repo, &wt_root, "feat/{feature}-{task}", 1,
        ).unwrap();

        delete_task_force(&mut file, "acme/app", &tf1.id, &repo, true).unwrap();

        // Re-create a task force with the same name under the same feature.
        // Without deleting the branch on delete, this would collide with the
        // still-existing branch from the first create.
        let tf2 = create_task_force(
            &mut file, "acme/app", &feat.id,
            CreateTfArgs { name: "drawer".into(), base_branch: "main".into(), linear_ticket: None },
            &repo, &wt_root, "feat/{feature}-{task}", 2,
        );
        assert!(tf2.is_ok(), "re-create after delete should succeed: {:?}", tf2.err());
        let tf2 = tf2.unwrap();
        assert_eq!(tf2.id, tf1.id);
        assert_eq!(tf2.branch, tf1.branch);
        assert!(Path::new(&tf2.worktree_path).exists(), "recreated worktree dir should exist");
    }

    #[test]
    fn build_inbox_lists_only_attention_statuses() {
        use crate::agents::AgentStatus;
        use std::collections::BTreeMap;
        let mut file = FactoryFile::default();
        let f = create_feature(&mut file, "acme/app", "Audit").unwrap();
        // two task forces created without git (insert directly for a pure test):
        let pf = file.projects.get_mut("acme/app").unwrap();
        let feat = pf.features.iter_mut().find(|x| x.id == f.id).unwrap();
        feat.task_forces.push(TaskForce { id: "t1".into(), name: "drawer".into(), branch: "b1".into(), base_branch: "main".into(), worktree_path: "/w1".into(), linear_ticket: None, created_at: 0, agent_session_id: None });
        feat.task_forces.push(TaskForce { id: "t2".into(), name: "export".into(), branch: "b2".into(), base_branch: "main".into(), worktree_path: "/w2".into(), linear_ticket: None, created_at: 0, agent_session_id: None });
        let mut st = BTreeMap::new();
        st.insert("acme/app::t1".to_string(), AgentStatus::AwaitingInput);
        st.insert("acme/app::t2".to_string(), AgentStatus::Working); // not attention
        let inbox = build_inbox(&file, &st);
        assert_eq!(inbox.len(), 1);
        assert_eq!(inbox[0].task_force_id, "t1");
        assert_eq!(inbox[0].feature_name, "Audit");
        assert_eq!(inbox[0].status, "awaitingInput");
    }
}
