//! Agent Factory store: branch-centric model persisted to ~/.kablan/factory.json.
//!
//! A Feature is a folder of branch names. Per-branch state (working-copy path
//! + agent session id) lives in `ProjectFactory::branch_state`, keyed by
//! branch — a branch may belong to at most one Feature, but always has at
//! most one `BranchState` regardless of filing.
//!
//! `load_file` transparently migrates the old Task-Force-shaped file (a
//! Feature that carried `taskForces`, plus a project-level
//! `worktreeSessions` map) into this shape. See `migrate` below.
//!
//! Core functions take injected paths so they unit-test without global config.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use crate::agents::AgentStatus;

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OldTaskForce {
    #[serde(default)]
    pub branch: String,
    #[serde(default)]
    pub worktree_path: String,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub agent_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Feature {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub branches: Vec<String>,
    /// Old-format (pre-branch-centric) task forces. Only ever populated when
    /// deserializing a file saved before this migration; `load_file`'s
    /// `migrate` step drains this into `branches` + the project's
    /// `branch_state` and it is never serialized back out.
    #[serde(default, skip_serializing)]
    pub task_forces: Vec<OldTaskForce>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BranchState {
    #[serde(default)]
    pub worktree_path: Option<String>,
    #[serde(default)]
    pub agent_session_id: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFactory {
    #[serde(default)]
    pub features: Vec<Feature>,
    #[serde(default)]
    pub branch_state: BTreeMap<String, BranchState>,
    /// Old-format agent sessions for arbitrary (non-task-force) worktrees.
    /// Dropped by `migrate`: those external sessions simply re-capture on
    /// the next agent start. Never serialized back out.
    #[serde(default, skip_serializing)]
    pub worktree_sessions: BTreeMap<String, String>,
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
    pub branch: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature_name: Option<String>,
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

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Normalize any old-format (Task-Force-shaped) data left over from a
/// lenient deserialize into the new branch-centric shape:
/// - each old task force's `branch` is pushed into its feature's `branches`
///   (deduped) and a matching `branch_state` entry is created carrying over
///   its worktree path + agent session id + created_at.
/// - `worktree_sessions` (agent sessions for ad-hoc, non-task-force
///   worktrees) is dropped — those sessions simply re-capture on next start.
/// No git calls are made here; this is pure data massaging.
fn migrate(file: &mut FactoryFile) {
    for pf in file.projects.values_mut() {
        for feat in pf.features.iter_mut() {
            for tf in feat.task_forces.drain(..) {
                if tf.branch.is_empty() {
                    continue;
                }
                if !feat.branches.iter().any(|b| b == &tf.branch) {
                    feat.branches.push(tf.branch.clone());
                }
                pf.branch_state.insert(
                    tf.branch.clone(),
                    BranchState {
                        worktree_path: if tf.worktree_path.is_empty() { None } else { Some(tf.worktree_path) },
                        agent_session_id: tf.agent_session_id,
                        created_at: tf.created_at,
                    },
                );
            }
        }
        pf.worktree_sessions.clear();
    }
}

pub fn load_file(path: &Path) -> FactoryFile {
    let mut file: FactoryFile = fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    migrate(&mut file);
    file
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
    let feat = Feature { id, name: name.to_string(), branches: Vec::new(), task_forces: Vec::new() };
    pf.features.push(feat.clone());
    Ok(feat)
}

/// Delete a feature. Its branches are simply unfiled (they keep whatever
/// `branch_state` they have; they just no longer belong to any feature).
pub fn delete_feature(file: &mut FactoryFile, project: &str, fid: &str) -> Result<(), String> {
    let pf = file.projects.get_mut(project).ok_or("Unknown project")?;
    let before = pf.features.len();
    pf.features.retain(|f| f.id != fid);
    if pf.features.len() == before {
        return Err("Unknown feature".to_string());
    }
    Ok(())
}

/// File `branch` into feature `fid`, removing it from any other feature in
/// the same project first — a branch belongs to at most one feature.
pub fn file_branch(file: &mut FactoryFile, project: &str, fid: &str, branch: &str) -> Result<(), String> {
    let branch = branch.trim();
    if branch.is_empty() {
        return Err("branch is required".to_string());
    }
    let pf = file.projects.get_mut(project).ok_or("Unknown project")?;
    if !pf.features.iter().any(|f| f.id == fid) {
        return Err("Unknown feature".to_string());
    }
    for f in pf.features.iter_mut() {
        if f.id != fid {
            f.branches.retain(|b| b != branch);
        }
    }
    let feat = pf.features.iter_mut().find(|f| f.id == fid).unwrap();
    if !feat.branches.iter().any(|b| b == branch) {
        feat.branches.push(branch.to_string());
    }
    Ok(())
}

/// Remove `branch` from feature `fid`'s membership (no-op if it wasn't filed
/// there). Its `branch_state` is untouched.
pub fn unfile_branch(file: &mut FactoryFile, project: &str, fid: &str, branch: &str) -> Result<(), String> {
    let pf = file.projects.get_mut(project).ok_or("Unknown project")?;
    let feat = pf.features.iter_mut().find(|f| f.id == fid).ok_or("Unknown feature")?;
    feat.branches.retain(|b| b != branch);
    Ok(())
}

/// Upsert the stored working-copy path for `branch` under `project`.
/// Creates the project's / branch's entry if this is its first record.
pub fn set_branch_worktree(file: &mut FactoryFile, project: &str, branch: &str, path: &str) {
    let pf = file.projects.entry(project.to_string()).or_default();
    let entry = pf.branch_state.entry(branch.to_string()).or_insert_with(|| BranchState {
        worktree_path: None,
        agent_session_id: None,
        created_at: now_secs(),
    });
    entry.worktree_path = Some(path.to_string());
}

/// Upsert the stored agent session id for `branch` under `project` (used to
/// `--resume` after a relaunch). Creates the entry if this is its first
/// recorded session (defensive — normally the worktree is set first).
pub fn set_branch_session(file: &mut FactoryFile, project: &str, branch: &str, sid: &str) {
    let pf = file.projects.entry(project.to_string()).or_default();
    let entry = pf.branch_state.entry(branch.to_string()).or_insert_with(|| BranchState {
        worktree_path: None,
        agent_session_id: None,
        created_at: now_secs(),
    });
    entry.agent_session_id = Some(sid.to_string());
}

/// Look up the stored state (working-copy path + agent session id) for
/// `branch` under `project`, if any.
pub fn get_branch_state<'a>(file: &'a FactoryFile, project: &str, branch: &str) -> Option<&'a BranchState> {
    file.projects.get(project)?.branch_state.get(branch)
}

/// The feature `branch` is filed into, under `project`, if any.
pub fn feature_of<'a>(file: &'a FactoryFile, project: &str, branch: &str) -> Option<&'a Feature> {
    file.projects
        .get(project)?
        .features
        .iter()
        .find(|f| f.branches.iter().any(|b| b == branch))
}

/// Build the global inbox: branches whose agent needs attention (AwaitingInput
/// or Failed). Deterministic order: projects (BTreeMap order), branches
/// (BTreeMap order — `branch_state` is a BTreeMap too).
pub fn build_inbox(file: &FactoryFile, statuses: &BTreeMap<String, AgentStatus>) -> Vec<InboxEntry> {
    let mut entries = Vec::new();
    for (project, pf) in file.projects.iter() {
        for branch in pf.branch_state.keys() {
            let key = format!("{project}::branch:{branch}");
            let Some(status) = statuses.get(&key) else { continue };
            let status_str = match status {
                AgentStatus::AwaitingInput => "awaitingInput",
                AgentStatus::Failed => "failed",
                _ => continue,
            };
            let feat = pf.features.iter().find(|f| f.branches.iter().any(|b| b == branch));
            entries.push(InboxEntry {
                project: project.clone(),
                branch: branch.clone(),
                feature_id: feat.map(|f| f.id.clone()),
                feature_name: feat.map(|f| f.name.clone()),
                status: status_str.to_string(),
            });
        }
    }
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_basic() {
        assert_eq!(slugify("Audit Log v2!"), "audit-log-v2");
        assert_eq!(slugify("  --Weird__Name--  "), "weird-name");
        assert_eq!(slugify(""), "item");
    }

    #[test]
    fn load_missing_file_is_empty() {
        let f = load_file(&std::env::temp_dir().join("kablan-factory-does-not-exist.json"));
        assert!(f.projects.is_empty());
    }

    #[test]
    fn load_empty_file_is_fine() {
        let path = std::env::temp_dir().join(format!("kablan-factory-empty-{}.json", now_secs()));
        std::fs::write(&path, "").unwrap();
        let f = load_file(&path);
        assert!(f.projects.is_empty());
    }

    #[test]
    fn create_feature_and_roundtrip() {
        let path = std::env::temp_dir().join(format!("kablan-factory-{}.json", now_secs()));
        let mut file = load_file(&path);
        let feat = create_feature(&mut file, "acme/app", "Audit Log v2").unwrap();
        assert_eq!(feat.id, "audit-log-v2");
        assert_eq!(feat.name, "Audit Log v2");
        assert!(feat.branches.is_empty());
        save_file(&path, &file).unwrap();

        let reloaded = load_file(&path);
        assert_eq!(reloaded.projects["acme/app"].features.len(), 1);
        assert_eq!(reloaded.projects["acme/app"].features[0].id, "audit-log-v2");
        assert!(reloaded.projects["acme/app"].features[0].branches.is_empty());
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
    fn delete_feature_removes_it_leaving_branch_state_untouched() {
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "p", "Audit").unwrap();
        file_branch(&mut file, "p", &feat.id, "feat/audit-x").unwrap();
        set_branch_worktree(&mut file, "p", "feat/audit-x", "/wt/x");

        delete_feature(&mut file, "p", &feat.id).unwrap();

        assert!(file.projects["p"].features.is_empty());
        // branch state (working copy) survives — the branch just becomes unfiled.
        assert_eq!(
            get_branch_state(&file, "p", "feat/audit-x").unwrap().worktree_path.as_deref(),
            Some("/wt/x")
        );
        assert!(feature_of(&file, "p", "feat/audit-x").is_none());
    }

    #[test]
    fn delete_feature_unknown_errors() {
        let mut file = FactoryFile::default();
        create_feature(&mut file, "p", "Audit").unwrap();
        assert!(delete_feature(&mut file, "p", "nope").is_err());
        assert!(delete_feature(&mut file, "nope-project", "nope").is_err());
    }

    #[test]
    fn file_branch_adds_membership_and_dedups() {
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "p", "Audit").unwrap();
        file_branch(&mut file, "p", &feat.id, "feat/a").unwrap();
        file_branch(&mut file, "p", &feat.id, "feat/a").unwrap(); // re-file is a no-op
        assert_eq!(file.projects["p"].features[0].branches, vec!["feat/a".to_string()]);
        assert_eq!(feature_of(&file, "p", "feat/a").unwrap().id, feat.id);
    }

    #[test]
    fn file_branch_moves_between_features() {
        let mut file = FactoryFile::default();
        let f1 = create_feature(&mut file, "p", "Audit").unwrap();
        let f2 = create_feature(&mut file, "p", "Export").unwrap();
        file_branch(&mut file, "p", &f1.id, "feat/shared").unwrap();
        assert_eq!(feature_of(&file, "p", "feat/shared").unwrap().id, f1.id);

        file_branch(&mut file, "p", &f2.id, "feat/shared").unwrap();
        assert_eq!(feature_of(&file, "p", "feat/shared").unwrap().id, f2.id);
        assert!(file.projects["p"].features.iter().find(|f| f.id == f1.id).unwrap().branches.is_empty());
    }

    #[test]
    fn file_branch_unknown_feature_errors() {
        let mut file = FactoryFile::default();
        create_feature(&mut file, "p", "Audit").unwrap();
        assert!(file_branch(&mut file, "p", "nope", "feat/a").is_err());
    }

    #[test]
    fn unfile_branch_removes_membership_but_keeps_branch_state() {
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "p", "Audit").unwrap();
        file_branch(&mut file, "p", &feat.id, "feat/a").unwrap();
        set_branch_worktree(&mut file, "p", "feat/a", "/wt/a");

        unfile_branch(&mut file, "p", &feat.id, "feat/a").unwrap();

        assert!(file.projects["p"].features[0].branches.is_empty());
        assert!(feature_of(&file, "p", "feat/a").is_none());
        assert_eq!(get_branch_state(&file, "p", "feat/a").unwrap().worktree_path.as_deref(), Some("/wt/a"));
    }

    #[test]
    fn set_branch_worktree_then_get_branch_state() {
        let mut file = FactoryFile::default();
        assert!(get_branch_state(&file, "p", "feat/a").is_none());
        set_branch_worktree(&mut file, "p", "feat/a", "/wt/a");
        let st = get_branch_state(&file, "p", "feat/a").unwrap();
        assert_eq!(st.worktree_path.as_deref(), Some("/wt/a"));
        assert!(st.agent_session_id.is_none());
    }

    #[test]
    fn set_branch_session_upserts_existing_state() {
        let mut file = FactoryFile::default();
        set_branch_worktree(&mut file, "p", "feat/a", "/wt/a");
        set_branch_session(&mut file, "p", "feat/a", "sess-1");
        let st = get_branch_state(&file, "p", "feat/a").unwrap();
        assert_eq!(st.worktree_path.as_deref(), Some("/wt/a"));
        assert_eq!(st.agent_session_id.as_deref(), Some("sess-1"));
    }

    #[test]
    fn set_branch_session_creates_entry_when_none_exists() {
        let mut file = FactoryFile::default();
        set_branch_session(&mut file, "p", "feat/a", "sess-1");
        let st = get_branch_state(&file, "p", "feat/a").unwrap();
        assert!(st.worktree_path.is_none());
        assert_eq!(st.agent_session_id.as_deref(), Some("sess-1"));
    }

    #[test]
    fn get_branch_state_unknown_project_or_branch_is_none() {
        let mut file = FactoryFile::default();
        assert!(get_branch_state(&file, "nope", "x").is_none());
        set_branch_worktree(&mut file, "p", "feat/a", "/wt/a");
        assert!(get_branch_state(&file, "p", "feat/unknown").is_none());
    }

    #[test]
    fn new_format_file_roundtrips() {
        let path = std::env::temp_dir().join(format!("kablan-factory-new-{}.json", now_secs()));
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "acme/app", "Audit").unwrap();
        file_branch(&mut file, "acme/app", &feat.id, "feat/audit-drawer").unwrap();
        set_branch_worktree(&mut file, "acme/app", "feat/audit-drawer", "/wt/drawer");
        set_branch_session(&mut file, "acme/app", "feat/audit-drawer", "sess-1");
        save_file(&path, &file).unwrap();

        let reloaded = load_file(&path);
        assert_eq!(reloaded.projects["acme/app"].features[0].branches, vec!["feat/audit-drawer".to_string()]);
        let st = &reloaded.projects["acme/app"].branch_state["feat/audit-drawer"];
        assert_eq!(st.worktree_path.as_deref(), Some("/wt/drawer"));
        assert_eq!(st.agent_session_id.as_deref(), Some("sess-1"));

        // The saved JSON is the new shape only — no leftover task-force keys.
        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(!raw.contains("taskForces"));
        assert!(!raw.contains("worktreeSessions"));
    }

    #[test]
    fn old_format_json_migrates_into_new_shape() {
        let old_json = r#"{
            "projects": {
                "acme/app": {
                    "features": [
                        {
                            "id": "audit",
                            "name": "Audit",
                            "taskForces": [
                                {
                                    "id": "drawer",
                                    "name": "Drawer",
                                    "branch": "feat/audit-drawer",
                                    "baseBranch": "main",
                                    "worktreePath": "/wt/drawer",
                                    "createdAt": 111,
                                    "agentSessionId": "sess-1"
                                }
                            ]
                        }
                    ],
                    "worktreeSessions": { "/wt/adhoc": "sess-2" }
                }
            }
        }"#;
        let path = std::env::temp_dir().join(format!("kablan-factory-old-{}.json", now_secs()));
        std::fs::write(&path, old_json).unwrap();

        let file = load_file(&path);

        let feat = &file.projects["acme/app"].features[0];
        assert_eq!(feat.id, "audit");
        assert_eq!(feat.branches, vec!["feat/audit-drawer".to_string()]);
        assert!(feat.task_forces.is_empty(), "old task_forces should be drained by migration");

        let st = &file.projects["acme/app"].branch_state["feat/audit-drawer"];
        assert_eq!(st.worktree_path.as_deref(), Some("/wt/drawer"));
        assert_eq!(st.agent_session_id.as_deref(), Some("sess-1"));
        assert_eq!(st.created_at, 111);

        assert_eq!(feature_of(&file, "acme/app", "feat/audit-drawer").unwrap().id, "audit");

        // worktreeSessions (ad-hoc, non-task-force agent sessions) are dropped.
        assert!(file.projects["acme/app"].worktree_sessions.is_empty());

        // Re-saving produces the pure new shape (no leftover old-format keys).
        save_file(&path, &file).unwrap();
        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(!raw.contains("taskForces"));
        assert!(!raw.contains("worktreeSessions"));
    }

    #[test]
    fn old_format_without_worktree_sessions_still_loads() {
        let path = std::env::temp_dir().join(format!("kablan-factory-old2-{}.json", now_secs()));
        let old_json = r#"{"projects":{"acme/app":{"features":[]}}}"#;
        std::fs::write(&path, old_json).unwrap();
        let file = load_file(&path);
        assert!(file.projects["acme/app"].features.is_empty());
        assert!(file.projects["acme/app"].branch_state.is_empty());
    }

    #[test]
    fn build_inbox_lists_only_attention_statuses() {
        use crate::agents::AgentStatus;
        use std::collections::BTreeMap;
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "acme/app", "Audit").unwrap();
        file_branch(&mut file, "acme/app", &feat.id, "b1").unwrap();
        set_branch_worktree(&mut file, "acme/app", "b1", "/w1");
        set_branch_worktree(&mut file, "acme/app", "b2", "/w2"); // unfiled branch, still has state

        let mut st = BTreeMap::new();
        st.insert("acme/app::branch:b1".to_string(), AgentStatus::AwaitingInput);
        st.insert("acme/app::branch:b2".to_string(), AgentStatus::Working); // not attention

        let inbox = build_inbox(&file, &st);
        assert_eq!(inbox.len(), 1);
        assert_eq!(inbox[0].branch, "b1");
        assert_eq!(inbox[0].feature_name.as_deref(), Some("Audit"));
        assert_eq!(inbox[0].status, "awaitingInput");
    }

    #[test]
    fn build_inbox_entry_for_unfiled_branch_has_no_feature() {
        use crate::agents::AgentStatus;
        use std::collections::BTreeMap;
        let mut file = FactoryFile::default();
        set_branch_worktree(&mut file, "acme/app", "b1", "/w1");
        let mut st = BTreeMap::new();
        st.insert("acme/app::branch:b1".to_string(), AgentStatus::Failed);

        let inbox = build_inbox(&file, &st);
        assert_eq!(inbox.len(), 1);
        assert!(inbox[0].feature_id.is_none());
        assert_eq!(inbox[0].status, "failed");
    }
}
