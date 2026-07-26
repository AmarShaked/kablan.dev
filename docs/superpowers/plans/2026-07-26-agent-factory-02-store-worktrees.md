# Agent Factory — Plan 02: Factory Store + Worktree Lifecycle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Rust `factory` module that persists Features + Task Forces to `~/.kablan/factory.json`, creates a Task Force as a real git branch + worktree (create-new only), deletes/cleans it up, flags orphaned worktrees, and exposes HTTP endpoints — with no agent yet (Task Forces exist as worktrees).

**Architecture:** New `src-tauri/src/factory.rs`. Core functions are **dependency-injected** — they take explicit store path, repo dir, worktree root, branch pattern, and `created_at` — so they unit-test over temp dirs + temp git repos with no global env. The lib.rs handlers do the wiring: resolve the project dir (existing guard), read config (`FactorySettings` from Plan 01), compute the store path under the config dir, and call the pure-ish functions. Desktop-only (Rust), excluded from the cross-backend parity suite like the GitLab layer.

**Tech Stack:** Rust (serde, serde_json, std::fs, std::process via existing `git::git`), Axum.

## Global Constraints

- **TDD:** every task writes a failing test first, then the minimal code to pass. Git/disk logic is tested over real temp git repos + temp store paths (no `KABLAN_CONFIG_DIR`, no mocks needed — paths are parameters).
- **camelCase** JSON (serde `rename_all = "camelCase"`), matching the rest of the app and the TS side.
- **Create-new only:** a Task Force always creates a NEW branch + worktree off a base; never adopts an existing branch/worktree.
- Core `factory` functions take injected paths/values — they must NOT read global config or call `config::load()` / `config_dir()` directly (only the lib.rs handlers do that wiring).
- The existing **75-test parity suite stays green** (`npm run test:server:rust`); factory endpoints are Rust-only and excluded, as with GitLab.
- Branch name comes from the configured `branchPattern` with `{feature}` and `{task}` replaced by the feature id and task-force id (both slugs).
- Ids are readable slugs of the name, de-duplicated within their parent (`name` → `name-2` → `name-3`).
- No secrets in the factory store. Commit after each task with a `feat(factory):` / `test(factory):` prefix.

## File Structure

- `src-tauri/src/factory.rs` — NEW. Store types, persistence, feature/task-force CRUD, worktree lifecycle, reconcile, `#[cfg(test)]` tests.
- `src-tauri/src/lib.rs` — register `pub mod factory;`, add 4 routes + handlers, expose `config::config_dir` + `git::default_branch` as needed.
- `src-tauri/src/config.rs` — make `config_dir()` `pub`.
- `src-tauri/src/git.rs` — make `default_branch()` `pub`.

## Data model (camelCase JSON)

```
FactoryFile   { projects: { <projectName>: ProjectFactory } }
ProjectFactory{ features: Feature[] }
Feature       { id, name, taskForces: TaskForce[] }
TaskForce     { id, name, branch, baseBranch, worktreePath, linearTicket?, createdAt }
```

`GET .../factory` response: `{ features: Feature[], orphaned: string[] }` (orphaned = task-force ids whose worktree path no longer exists on disk).

---

## Task 1: factory.rs store + feature CRUD

**Files:**
- Create: `src-tauri/src/factory.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod factory;`)
- Test: `src-tauri/src/factory.rs` (`#[cfg(test)]`)

**Interfaces:**
- Produces: the store types above; `pub fn load_file(&Path) -> FactoryFile`; `pub fn save_file(&Path, &FactoryFile) -> Result<(), String>`; `pub fn create_feature(&mut FactoryFile, project, name) -> Result<Feature, String>`; `pub fn slugify(&str) -> String`.

- [ ] **Step 1: Register the module**

In `src-tauri/src/lib.rs`, add near the other `pub mod` lines:

```rust
pub mod factory;
```

- [ ] **Step 2: Write the failing tests**

Create `src-tauri/src/factory.rs` with the types (Step 3) and this test module:

```rust
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
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features factory::tests`
Expected: FAIL to compile (types/functions not defined).

- [ ] **Step 4: Implement the store**

At the top of `src-tauri/src/factory.rs`:

```rust
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features factory::tests`
Expected: PASS (5 tests). (`git` import is unused until Task 2 — if the compiler warns, leave it; Task 2 uses it. If it errors as unused, add `#[allow(unused_imports)]` on the `use crate::git;` line and remove it in Task 2.)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/factory.rs src-tauri/src/lib.rs
git commit -m "feat(factory): store types + feature CRUD + persistence"
```

---

## Task 2: Worktree lifecycle (create + delete Task Force)

**Files:**
- Modify: `src-tauri/src/factory.rs`
- Test: `src-tauri/src/factory.rs` (`#[cfg(test)]`)

**Interfaces:**
- Produces: `pub struct CreateTfArgs`; `pub fn create_task_force(file, project, feature_id, args, repo_dir, worktree_root, branch_pattern, created_at) -> Result<TaskForce, String>`; `pub fn delete_task_force(file, project, tf_id, repo_dir, remove_worktree) -> Result<(), String>`.
- Consumes: `git::git(cwd, args)`.

- [ ] **Step 1: Write the failing tests**

Add a helper + tests to the `tests` module in `factory.rs`:

```rust
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
    fn create_task_force_makes_branch_and_worktree() {
        let repo = init_repo();
        let wt_root = tmp();
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "acme/app", "Audit").unwrap();
        let tf = create_task_force(
            &mut file, "acme/app", &feat.id,
            CreateTfArgs { name: "Details Drawer", base_branch: "main", linear_ticket: Some("FE-1".into()) },
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
            CreateTfArgs { name: "x", base_branch: "main", linear_ticket: None },
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
            CreateTfArgs { name: "drawer", base_branch: "main", linear_ticket: None },
            &repo, &wt_root, "feat/{feature}-{task}", 1,
        ).unwrap();
        let wt = tf.worktree_path.clone();
        delete_task_force(&mut file, "acme/app", &tf.id, &repo, true).unwrap();
        assert!(file.projects["acme/app"].features[0].task_forces.is_empty());
        assert!(!Path::new(&wt).exists(), "worktree dir should be gone");
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features factory::tests::create_task_force_makes_branch_and_worktree`
Expected: FAIL to compile (`CreateTfArgs`/`create_task_force` missing).

- [ ] **Step 3: Implement**

Add to `factory.rs`:

```rust
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
```

Remove the `#[allow(unused_imports)]` from `use crate::git;` if you added it in Task 1 (it's used now).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features factory::tests`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/factory.rs
git commit -m "feat(factory): create/delete task force with git worktree lifecycle"
```

---

## Task 3: Reconcile orphaned worktrees

**Files:**
- Modify: `src-tauri/src/factory.rs`
- Test: `src-tauri/src/factory.rs` (`#[cfg(test)]`)

**Interfaces:**
- Produces: `pub fn orphaned_task_forces(file, project) -> Vec<String>` — ids of task forces whose `worktree_path` no longer exists on disk.

- [ ] **Step 1: Write the failing test**

Add to the `tests` module:

```rust
    #[test]
    fn orphaned_lists_missing_worktrees() {
        let repo = init_repo();
        let wt_root = tmp();
        let mut file = FactoryFile::default();
        let feat = create_feature(&mut file, "acme/app", "Audit").unwrap();
        let tf = create_task_force(
            &mut file, "acme/app", &feat.id,
            CreateTfArgs { name: "drawer", base_branch: "main", linear_ticket: None },
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features factory::tests::orphaned`
Expected: FAIL to compile (`orphaned_task_forces` missing).

- [ ] **Step 3: Implement**

Add to `factory.rs`:

```rust
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features factory::tests`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/factory.rs
git commit -m "feat(factory): reconcile orphaned worktrees"
```

---

## Task 4: HTTP endpoints + config/git wiring

**Files:**
- Modify: `src-tauri/src/lib.rs` (routes + handlers), `src-tauri/src/config.rs` (`pub fn config_dir`), `src-tauri/src/git.rs` (`pub fn default_branch`)

**Interfaces:**
- Consumes: `factory::*`, `config::load()`, `config::config_dir()`, `git::default_branch()`, `projects::project_path_from_name()`.
- Produces routes:
  - `GET  /api/projects/:name/factory` → `{ features, orphaned }`
  - `POST /api/projects/:name/factory/features` `{ name }` → `Feature`
  - `POST /api/projects/:name/factory/features/:fid/taskforces` `{ name, baseBranch?, linearTicket? }` → `TaskForce`
  - `DELETE /api/projects/:name/factory/taskforces/:tid` `{ removeWorktree? }` → `{ ok: true }`

- [ ] **Step 1: Expose the two helpers**

In `src-tauri/src/config.rs` change `fn config_dir()` to `pub fn config_dir()`.
In `src-tauri/src/git.rs` change `fn default_branch(` to `pub fn default_branch(`.

- [ ] **Step 2: Add routes**

In `src-tauri/src/lib.rs` router, after the gitlab routes, add:

```rust
        .route("/api/projects/:name/factory", get(get_factory))
        .route("/api/projects/:name/factory/features", post(post_feature))
        .route("/api/projects/:name/factory/features/:fid/taskforces", post(post_task_force))
        .route("/api/projects/:name/factory/taskforces/:tid", delete(delete_task_force_route))
```

- [ ] **Step 3: Add handlers**

Add to `lib.rs` (near the gitlab handlers). These wire config + the store path + the project dir into the tested `factory` functions:

```rust
fn factory_store_path() -> std::path::PathBuf {
    config::config_dir().join("factory.json")
}

async fn get_factory(Path(name): Path<String>) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let key = name.clone();
    let out = blocking(move || {
        let file = factory::load_file(&factory_store_path());
        let features = file.projects.get(&key).cloned().unwrap_or_default().features;
        let orphaned = factory::orphaned_task_forces(&file, &key);
        let _ = dir; // reserved for future git-based reconcile
        json!({ "features": features, "orphaned": orphaned })
    })
    .await;
    Ok(Json(out))
}

async fn post_feature(Path(name): Path<String>, body: Bytes) -> ApiResult {
    projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let fname = b.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let key = name.clone();
    let feat = blocking(move || {
        let path = factory_store_path();
        let mut file = factory::load_file(&path);
        let feat = factory::create_feature(&mut file, &key, &fname)?;
        factory::save_file(&path, &file)?;
        Ok::<_, String>(feat)
    })
    .await
    .map_err(bad)?;
    Ok(Json(serde_json::to_value(feat).unwrap()))
}

async fn post_task_force(Path((name, fid)): Path<(String, String)>, body: Bytes) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let tf_name = b.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let linear = b.get("linearTicket").and_then(|v| v.as_str()).map(|s| s.to_string());
    let base_override = b.get("baseBranch").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let key = name.clone();
    let tf = blocking(move || {
        let cfg = config::load();
        let base = base_override
            .or_else(|| { let d = cfg.factory.default_base_branch.trim(); if d.is_empty() { None } else { Some(d.to_string()) } })
            .or_else(|| git::default_branch(&dir))
            .unwrap_or_else(|| "main".to_string());
        let wt_root = if cfg.factory.worktree_root.trim().is_empty() {
            config::config_dir().join("worktrees")
        } else {
            std::path::PathBuf::from(cfg.factory.worktree_root.trim())
        };
        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let path = factory_store_path();
        let mut file = factory::load_file(&path);
        let tf = factory::create_task_force(
            &mut file, &key, &fid,
            factory::CreateTfArgs { name: tf_name, base_branch: base, linear_ticket: linear },
            std::path::Path::new(&dir), &wt_root, &cfg.factory.branch_pattern, created_at,
        )?;
        factory::save_file(&path, &file)?;
        Ok::<_, String>(tf)
    })
    .await
    .map_err(bad)?;
    Ok(Json(serde_json::to_value(tf).unwrap()))
}

async fn delete_task_force_route(Path((name, tid)): Path<(String, String)>, body: Bytes) -> ApiResult {
    let dir = projects::project_path_from_name(&name).map_err(bad)?;
    let b = parse_body(&body);
    let remove_wt = b.get("removeWorktree").and_then(|v| v.as_bool()).unwrap_or(true);
    let key = name.clone();
    blocking(move || {
        let path = factory_store_path();
        let mut file = factory::load_file(&path);
        factory::delete_task_force(&mut file, &key, &tid, std::path::Path::new(&dir), remove_wt)?;
        factory::save_file(&path, &file)?;
        Ok::<_, String>(())
    })
    .await
    .map_err(bad)?;
    Ok(Json(json!({ "ok": true })))
}
```

Confirm `Bytes`, `parse_body`, `json!`, `get`, `post`, `delete`, `Path` are already imported in `lib.rs` (they are — used by existing handlers). Add any missing `use` only if the compiler flags it.

- [ ] **Step 4: Build + verify nothing regressed**

Run: `cargo build --manifest-path src-tauri/Cargo.toml --lib --no-default-features`
Expected: compiles clean (no warnings from the new code).
Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features factory::tests`
Expected: PASS (10 tests — unchanged; endpoints are thin wrappers over tested functions).
Run: `npm run test:server:rust 2>&1 | tail -4`
Expected: `# fail 0` (parity intact — factory routes are additive and Rust-only).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/config.rs src-tauri/src/git.rs
git commit -m "feat(factory): HTTP endpoints for features + task forces"
```

---

## Verification (whole plan)

- `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features factory::tests` → 10 pass.
- `cargo build --manifest-path src-tauri/Cargo.toml --lib --no-default-features` → clean.
- `npm run test:server:rust` → `# fail 0` (75 parity intact).
- Manual (desktop): `POST` a feature, then a task force → a new branch + worktree appears under the worktree root; `GET .../factory` returns it; deleting removes the worktree.

## Notes for later plans

- **Plan 03 (agent supervisor)** adds `agentSessionId` + live status to `TaskForce` and spawns the owned agent in `worktree_path`. The store shape here is forward-compatible (new fields default in).
- **Plan 04 (cockpit UI)** consumes `GET .../factory` for the nested sidebar + create dialog (`POST` endpoints).
- The `GET` handler's `dir` is currently unused (reserved) — Plan 03/05 may extend reconcile to cross-check `git worktree list` against the store.
