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
    /// Friendly display title shown in the sidebar/cockpit instead of the raw git
    /// branch name. Does NOT rename the branch — the branch name remains the key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
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
                        title: None,
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
        title: None,
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
        title: None,
    });
    entry.agent_session_id = Some(sid.to_string());
}

/// Forget the recorded Claude session id for `branch` under `project`, so the next agent start
/// launches a brand-new conversation instead of `--resume`-ing the old one. Used by the chat
/// RESET action. A no-op when there's no state entry (nothing to forget).
pub fn clear_branch_session(file: &mut FactoryFile, project: &str, branch: &str) {
    if let Some(pf) = file.projects.get_mut(project) {
        if let Some(entry) = pf.branch_state.get_mut(branch) {
            entry.agent_session_id = None;
        }
    }
}

/// Upsert the friendly display title for `branch` under `project`. An empty or
/// whitespace-only `title` clears it back to `None` (the sidebar then falls back
/// to the raw branch name). Creates the branch's state entry if this is its first
/// record. Never renames the git branch — `branch` stays the key.
pub fn set_branch_title(file: &mut FactoryFile, project: &str, branch: &str, title: Option<String>) {
    let normalized = title.and_then(|t| {
        let t = t.trim();
        if t.is_empty() { None } else { Some(t.to_string()) }
    });
    let pf = file.projects.entry(project.to_string()).or_default();
    let entry = pf.branch_state.entry(branch.to_string()).or_insert_with(|| BranchState {
        worktree_path: None,
        agent_session_id: None,
        created_at: now_secs(),
        title: None,
    });
    entry.title = normalized;
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

/// True iff `a` and `b` contain exactly the same elements (same length, same multiset) —
/// order-independent. Used to validate a reorder request without allowing it to sneak in
/// additions, removals, or duplicates.
/// Reorder feature `fid`'s branches. `branches` is the desired order of a SUBSET of its current
/// branches (unknown ids / duplicates are rejected); any current branches not mentioned are kept
/// in their existing relative order at the end. Persists a drag-and-drop reorder within a feature
/// folder in the sidebar (tolerant of the sidebar's 10-row cap and filtered ghost branches).
pub fn reorder_feature_branches(
    file: &mut FactoryFile,
    project: &str,
    fid: &str,
    branches: Vec<String>,
) -> Result<(), String> {
    let pf = file.projects.get_mut(project).ok_or("Unknown project")?;
    let feat = pf.features.iter_mut().find(|f| f.id == fid).ok_or("Unknown feature")?;
    // Tolerant reorder: `branches` is the desired order of the SUBSET the caller can see (the
    // sidebar caps visible rows at 10 and filters out ghost/deleted branches), not necessarily
    // the whole stored set. Accept any subset of the feature's current branches (reject unknown
    // ids / duplicates), reorder those, and keep the remaining stored branches in their existing
    // relative order at the end — so a partial reorder never drops membership or errors.
    let mut seen = std::collections::HashSet::new();
    for b in &branches {
        if !feat.branches.contains(b) {
            return Err(format!("unknown branch in reorder: {b}"));
        }
        if !seen.insert(b.clone()) {
            return Err(format!("duplicate branch in reorder: {b}"));
        }
    }
    let mut new_order = branches;
    for b in &feat.branches {
        if !seen.contains(b) {
            new_order.push(b.clone());
        }
    }
    feat.branches = new_order;
    Ok(())
}

/// Reorder the project's features to exactly `order`, which must contain exactly the current
/// set of feature ids (any order — no additions, removals, or duplicates). Persists a
/// drag-and-drop reorder of the feature folders in the sidebar.
pub fn reorder_features(file: &mut FactoryFile, project: &str, order: Vec<String>) -> Result<(), String> {
    let pf = file.projects.get_mut(project).ok_or("Unknown project")?;
    let current_ids: Vec<String> = pf.features.iter().map(|f| f.id.clone()).collect();
    // Tolerant reorder (same rationale as reorder_feature_branches — the sidebar caps visible
    // folders at 10): accept any subset of the current feature ids, reorder those, and append the
    // rest in their existing order.
    let mut seen = std::collections::HashSet::new();
    for id in &order {
        if !current_ids.contains(id) {
            return Err(format!("unknown feature id in reorder: {id}"));
        }
        if !seen.insert(id.clone()) {
            return Err(format!("duplicate feature id in reorder: {id}"));
        }
    }
    let full_order: Vec<String> = order
        .iter()
        .cloned()
        .chain(current_ids.iter().filter(|id| !seen.contains(*id)).cloned())
        .collect();
    let mut by_id: BTreeMap<String, Feature> = pf.features.drain(..).map(|f| (f.id.clone(), f)).collect();
    pf.features = full_order.iter().filter_map(|id| by_id.remove(id)).collect();
    Ok(())
}

/// Reconcile one project's factory state BY WORKTREE PATH, healing sessions whose
/// worktree was checked out onto a new branch after the session was created.
///
/// The "New session" flow creates a `session/<hex>` branch + worktree and files it
/// into the factory keyed by that branch. When the agent later runs
/// `git checkout -b <real-branch>` in that same worktree, the worktree at path `P`
/// is now on branch `M` (`<real-branch>`), but the factory still records the old
/// key `N` (`session/<hex>`) → `P`. Both `N` (via its stale worktree_path) and `M`
/// (via the live worktree) then resolve to the same working copy, so the sidebar
/// lights up two rows for one running agent.
///
/// For each `branch_state[N]` whose `worktree_path = P` is Some, look up the branch
/// `M` the worktree at `P` is currently on (via `path_to_branch`). If `M` is
/// non-empty and differs from `N`, MIGRATE `N` → `M`:
/// - `branch_state`: move `N`'s state onto `M` (insert if `M` has none; otherwise
///   prefer `M`'s fields but fill any missing worktree_path/agent_session_id/title
///   from `N`), then remove `N` (it becomes a plain branch with no factory state —
///   no git refs are touched).
/// - `features`: replace `N` with `M` in every feature's `branches` (dedupe if `M`
///   is already present; order otherwise preserved).
///
/// Skips (rather than clobbers) a migration when `M` already owns a DISTINCT
/// worktree — i.e. `M` has its own `branch_state` whose `worktree_path` is Some and
/// points at a path other than `P` — since that's a genuinely separate session.
///
/// Pure: makes no git calls (the caller supplies `path_to_branch` from
/// `git::list_worktrees`) and performs no agent rekeys itself. Returns the list of
/// `(old_key, new_key)` FULL agent keys (`{project}::branch:{branch}`) the caller
/// must rekey on the live `Agents` registry — empty when nothing changed (a
/// non-empty result is exactly the "something changed, persist me" signal).
pub fn reconcile_project_worktrees(
    file: &mut FactoryFile,
    project: &str,
    path_to_branch: &BTreeMap<String, String>,
) -> Vec<(String, String)> {
    let mut rekeys = Vec::new();
    let Some(pf) = file.projects.get_mut(project) else { return rekeys };

    // Plan the migrations from an immutable scan first, so we never mutate
    // `branch_state` while iterating it. Each planned entry is (N, M).
    let mut migrations: Vec<(String, String)> = Vec::new();
    for (n, st) in pf.branch_state.iter() {
        let Some(p) = st.worktree_path.as_deref() else { continue };
        let Some(m) = path_to_branch.get(p) else { continue };
        // Only migrate onto a real, different branch.
        if m.is_empty() || m == n {
            continue;
        }
        // Don't clobber a genuinely separate session: if M already has its own
        // branch_state pointing at a DIFFERENT worktree path, leave both alone.
        if let Some(m_state) = pf.branch_state.get(m) {
            if let Some(m_path) = m_state.worktree_path.as_deref() {
                if m_path != p {
                    continue;
                }
            }
        }
        migrations.push((n.clone(), m.clone()));
    }

    for (n, m) in migrations {
        // 1. branch_state: move N onto M (merge into M if it already exists).
        if let Some(n_state) = pf.branch_state.remove(&n) {
            match pf.branch_state.get_mut(&m) {
                Some(m_state) => {
                    // Prefer M's own fields; fill only the gaps from N.
                    if m_state.worktree_path.is_none() {
                        m_state.worktree_path = n_state.worktree_path;
                    }
                    if m_state.agent_session_id.is_none() {
                        m_state.agent_session_id = n_state.agent_session_id;
                    }
                    if m_state.title.is_none() {
                        m_state.title = n_state.title;
                    }
                }
                None => {
                    pf.branch_state.insert(m.clone(), n_state);
                }
            }
        }

        // 2. features: replace N with M in every feature's branches, deduping M.
        for feat in pf.features.iter_mut() {
            if !feat.branches.iter().any(|b| b == &n) {
                continue;
            }
            let mut rebuilt: Vec<String> = Vec::with_capacity(feat.branches.len());
            for b in feat.branches.drain(..) {
                let name = if b == n { m.clone() } else { b };
                if name == m && rebuilt.iter().any(|x| x == &m) {
                    continue; // dedupe M
                }
                rebuilt.push(name);
            }
            feat.branches = rebuilt;
        }

        // 3. Tell the caller to rekey the live agent from N's key onto M's.
        rekeys.push((
            format!("{project}::branch:{n}"),
            format!("{project}::branch:{m}"),
        ));
    }

    rekeys
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
    fn set_branch_title_set_and_clear_roundtrip() {
        let path = std::env::temp_dir().join(format!("kablan-factory-title-{}.json", now_secs()));
        let mut file = FactoryFile::default();
        // Set a title on a fresh branch (creates the entry).
        set_branch_title(&mut file, "p", "feat/a", Some("Nice Feature".to_string()));
        assert_eq!(get_branch_state(&file, "p", "feat/a").unwrap().title.as_deref(), Some("Nice Feature"));
        save_file(&path, &file).unwrap();

        // Survives a save/load round-trip.
        let reloaded = load_file(&path);
        assert_eq!(
            get_branch_state(&reloaded, "p", "feat/a").unwrap().title.as_deref(),
            Some("Nice Feature")
        );

        // Clearing with an empty/whitespace string resets it to None.
        let mut file2 = reloaded;
        set_branch_title(&mut file2, "p", "feat/a", Some("   ".to_string()));
        assert!(get_branch_state(&file2, "p", "feat/a").unwrap().title.is_none());
        save_file(&path, &file2).unwrap();
        let reloaded2 = load_file(&path);
        assert!(get_branch_state(&reloaded2, "p", "feat/a").unwrap().title.is_none());
        // A cleared title serializes away entirely (skip_serializing_if).
        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(!raw.contains("title"));

        // Passing None also clears (and upserts on a brand-new branch as None).
        set_branch_title(&mut file2, "p", "feat/b", None);
        assert!(get_branch_state(&file2, "p", "feat/b").unwrap().title.is_none());
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
    fn reorder_feature_branches_valid() {
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "p", "Audit").unwrap();
        file_branch(&mut file, "p", &feat.id, "feat/a").unwrap();
        file_branch(&mut file, "p", &feat.id, "feat/b").unwrap();
        file_branch(&mut file, "p", &feat.id, "feat/c").unwrap();
        assert_eq!(
            file.projects["p"].features[0].branches,
            vec!["feat/a".to_string(), "feat/b".to_string(), "feat/c".to_string()]
        );

        reorder_feature_branches(
            &mut file,
            "p",
            &feat.id,
            vec!["feat/c".to_string(), "feat/a".to_string(), "feat/b".to_string()],
        )
        .unwrap();
        assert_eq!(
            file.projects["p"].features[0].branches,
            vec!["feat/c".to_string(), "feat/a".to_string(), "feat/b".to_string()]
        );
    }

    #[test]
    fn reorder_feature_branches_rejects_unknown_and_dupes() {
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "p", "Audit").unwrap();
        file_branch(&mut file, "p", &feat.id, "feat/a").unwrap();
        file_branch(&mut file, "p", &feat.id, "feat/b").unwrap();

        // unknown branch id
        assert!(reorder_feature_branches(
            &mut file,
            "p",
            &feat.id,
            vec!["feat/a".to_string(), "feat/x".to_string()],
        )
        .is_err());
        // duplicate branch id
        assert!(reorder_feature_branches(
            &mut file,
            "p",
            &feat.id,
            vec!["feat/a".to_string(), "feat/a".to_string()],
        )
        .is_err());
        // unknown feature / project
        assert!(reorder_feature_branches(&mut file, "p", "nope", vec![]).is_err());
        assert!(reorder_feature_branches(&mut file, "nope-project", &feat.id, vec![]).is_err());

        // order is left untouched by the failed attempts
        assert_eq!(
            file.projects["p"].features[0].branches,
            vec!["feat/a".to_string(), "feat/b".to_string()]
        );
    }

    #[test]
    fn reorder_feature_branches_subset_keeps_rest() {
        // A partial reorder (only the visible/present subset) must not drop membership: reorder
        // the mentioned branches, keep the rest in their existing order at the end. Guards I1/I2
        // — the sidebar sends only the ≤10 visible rows, and ghost (deleted) branches are filtered.
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "p", "Audit").unwrap();
        for b in ["feat/a", "feat/b", "feat/c", "ghost"] {
            file_branch(&mut file, "p", &feat.id, b).unwrap();
        }
        reorder_feature_branches(
            &mut file,
            "p",
            &feat.id,
            vec!["feat/c".to_string(), "feat/a".to_string(), "feat/b".to_string()],
        )
        .unwrap();
        assert_eq!(
            file.projects["p"].features[0].branches,
            vec!["feat/c".to_string(), "feat/a".to_string(), "feat/b".to_string(), "ghost".to_string()]
        );
    }

    #[test]
    fn reorder_features_valid() {
        let mut file = FactoryFile::default();
        let f1 = create_feature(&mut file, "p", "Alpha").unwrap();
        let f2 = create_feature(&mut file, "p", "Beta").unwrap();
        let f3 = create_feature(&mut file, "p", "Gamma").unwrap();

        reorder_features(&mut file, "p", vec![f3.id.clone(), f1.id.clone(), f2.id.clone()]).unwrap();

        let ids: Vec<String> = file.projects["p"].features.iter().map(|f| f.id.clone()).collect();
        assert_eq!(ids, vec![f3.id, f1.id, f2.id]);
    }

    #[test]
    fn reorder_features_rejects_unknown_and_dupes() {
        let mut file = FactoryFile::default();
        let f1 = create_feature(&mut file, "p", "Alpha").unwrap();
        let f2 = create_feature(&mut file, "p", "Beta").unwrap();

        // unknown extra id
        assert!(reorder_features(&mut file, "p", vec![f1.id.clone(), f2.id.clone(), "nope".to_string()]).is_err());
        // duplicate id
        assert!(reorder_features(&mut file, "p", vec![f1.id.clone(), f1.id.clone()]).is_err());
        // unknown project
        assert!(reorder_features(&mut file, "nope-project", vec![]).is_err());

        // order is left untouched by the failed attempts
        let ids: Vec<String> = file.projects["p"].features.iter().map(|f| f.id.clone()).collect();
        assert_eq!(ids, vec![f1.id.clone(), f2.id.clone()]);
    }

    #[test]
    fn reorder_features_subset_keeps_rest() {
        // Only a subset visible/reordered (cap) → the unmentioned feature stays, appended in order.
        let mut file = FactoryFile::default();
        let f1 = create_feature(&mut file, "p", "Alpha").unwrap();
        let f2 = create_feature(&mut file, "p", "Beta").unwrap();
        let f3 = create_feature(&mut file, "p", "Gamma").unwrap();
        reorder_features(&mut file, "p", vec![f3.id.clone(), f1.id.clone()]).unwrap();
        let ids: Vec<String> = file.projects["p"].features.iter().map(|f| f.id.clone()).collect();
        assert_eq!(ids, vec![f3.id, f1.id, f2.id]);
    }

    /// Helper: a `path -> branch` map from `(path, branch)` pairs.
    fn path_map(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs.iter().map(|(p, b)| (p.to_string(), b.to_string())).collect()
    }

    #[test]
    fn reconcile_migrates_session_onto_checked_out_branch() {
        // A `session/x` session filed in a feature, whose worktree at /p is now on
        // `feat/real` (the agent ran `git checkout -b feat/real`). Reconcile migrates
        // the state + feature membership onto `feat/real` and returns the agent rekey.
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "acme/app", "Audit").unwrap();
        file_branch(&mut file, "acme/app", &feat.id, "session/x").unwrap();
        {
            let pf = file.projects.get_mut("acme/app").unwrap();
            pf.branch_state.insert(
                "session/x".to_string(),
                BranchState {
                    worktree_path: Some("/p".to_string()),
                    agent_session_id: Some("s".to_string()),
                    created_at: 42,
                    title: Some("t".to_string()),
                },
            );
        }

        let rekeys = reconcile_project_worktrees(&mut file, "acme/app", &path_map(&[("/p", "feat/real")]));

        // branch_state moved to feat/real (carrying worktree/session/title) and session/x is gone.
        let pf = &file.projects["acme/app"];
        assert!(!pf.branch_state.contains_key("session/x"), "old key removed");
        let st = &pf.branch_state["feat/real"];
        assert_eq!(st.worktree_path.as_deref(), Some("/p"));
        assert_eq!(st.agent_session_id.as_deref(), Some("s"));
        assert_eq!(st.title.as_deref(), Some("t"));
        assert_eq!(st.created_at, 42);

        // Feature membership swapped session/x -> feat/real.
        assert_eq!(pf.features[0].branches, vec!["feat/real".to_string()]);

        // Rekey list is the full old/new agent keys.
        assert_eq!(
            rekeys,
            vec![("acme/app::branch:session/x".to_string(), "acme/app::branch:feat/real".to_string())]
        );
    }

    #[test]
    fn reconcile_noop_when_worktree_still_on_same_branch() {
        // The worktree at /p is still on session/x — nothing to migrate.
        let mut file = FactoryFile::default();
        set_branch_worktree(&mut file, "acme/app", "session/x", "/p");

        let rekeys = reconcile_project_worktrees(&mut file, "acme/app", &path_map(&[("/p", "session/x")]));

        assert!(rekeys.is_empty());
        assert!(file.projects["acme/app"].branch_state.contains_key("session/x"));
    }

    #[test]
    fn reconcile_noop_when_no_worktree_at_path() {
        // No worktree currently lives at the recorded path (nothing in the map) —
        // the session's state is left untouched.
        let mut file = FactoryFile::default();
        set_branch_worktree(&mut file, "acme/app", "session/x", "/p");

        let rekeys = reconcile_project_worktrees(&mut file, "acme/app", &path_map(&[("/other", "feat/real")]));

        assert!(rekeys.is_empty());
        assert!(file.projects["acme/app"].branch_state.contains_key("session/x"));
        assert!(!file.projects["acme/app"].branch_state.contains_key("feat/real"));
    }

    #[test]
    fn reconcile_merges_into_existing_target_and_dedupes_feature() {
        // feat/real already has partial state (its own session id, no worktree path)
        // AND is already filed alongside session/x in the feature. Migration merges
        // (prefers M's session id, fills M's missing worktree_path from N) and the
        // feature ends with a single, deduped feat/real entry.
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "acme/app", "Audit").unwrap();
        file_branch(&mut file, "acme/app", &feat.id, "session/x").unwrap();
        file_branch(&mut file, "acme/app", &feat.id, "feat/real").unwrap();
        {
            let pf = file.projects.get_mut("acme/app").unwrap();
            pf.branch_state.insert(
                "session/x".to_string(),
                BranchState { worktree_path: Some("/p".to_string()), agent_session_id: Some("old".to_string()), created_at: 1, title: Some("old-title".to_string()) },
            );
            pf.branch_state.insert(
                "feat/real".to_string(),
                BranchState { worktree_path: None, agent_session_id: Some("new".to_string()), created_at: 2, title: None },
            );
        }

        let rekeys = reconcile_project_worktrees(&mut file, "acme/app", &path_map(&[("/p", "feat/real")]));

        let pf = &file.projects["acme/app"];
        assert!(!pf.branch_state.contains_key("session/x"));
        let st = &pf.branch_state["feat/real"];
        assert_eq!(st.agent_session_id.as_deref(), Some("new"), "prefers M's session id");
        assert_eq!(st.worktree_path.as_deref(), Some("/p"), "fills M's missing worktree_path from N");
        assert_eq!(st.title.as_deref(), Some("old-title"), "fills M's missing title from N");
        assert_eq!(pf.features[0].branches, vec!["feat/real".to_string()], "session/x replaced, feat/real deduped");
        assert_eq!(rekeys.len(), 1);
    }

    #[test]
    fn reconcile_skips_when_target_owns_a_distinct_worktree() {
        // feat/real already has its own DISTINCT worktree (/other). Migrating session/x
        // onto it would corrupt that separate session, so reconcile leaves both alone.
        let mut file = FactoryFile::default();
        set_branch_worktree(&mut file, "acme/app", "session/x", "/p");
        set_branch_worktree(&mut file, "acme/app", "feat/real", "/other");

        let rekeys = reconcile_project_worktrees(&mut file, "acme/app", &path_map(&[("/p", "feat/real")]));

        assert!(rekeys.is_empty());
        let pf = &file.projects["acme/app"];
        assert_eq!(pf.branch_state["session/x"].worktree_path.as_deref(), Some("/p"));
        assert_eq!(pf.branch_state["feat/real"].worktree_path.as_deref(), Some("/other"));
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
