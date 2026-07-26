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
