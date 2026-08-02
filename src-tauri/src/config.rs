//! App configuration — mirrors server/config.ts byte-for-byte in JSON shape.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOverride {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub dev_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSettings {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_notify_events")]
    pub events: Vec<String>,
}

fn default_notify_events() -> Vec<String> {
    vec!["awaitingInput".into(), "failed".into()]
}

impl Default for NotificationSettings {
    fn default() -> Self {
        NotificationSettings { enabled: true, events: default_notify_events() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactorySettings {
    #[serde(default = "default_agent_command")]
    pub agent_command: String,
    #[serde(default)]
    pub agent_model: String,
    #[serde(default = "default_permission_mode")]
    pub permission_mode: String,
    #[serde(default)]
    pub default_base_branch: String,
    #[serde(default)]
    pub worktree_root: String,
    #[serde(default = "default_branch_pattern")]
    pub branch_pattern: String,
    #[serde(default = "default_max_agents")]
    pub max_concurrent_agents: u32,
    #[serde(default = "default_true")]
    pub stop_agents_on_exit: bool,
    #[serde(default)]
    pub auto_resume_agents: bool,
    #[serde(default = "default_chat_history_days")]
    pub chat_history_days: u32,
    #[serde(default)]
    pub notifications: NotificationSettings,
}

fn default_agent_command() -> String { "claude".into() }
fn default_permission_mode() -> String { "acceptEdits".into() }
fn default_branch_pattern() -> String { "feat/{feature}-{task}".into() }
fn default_max_agents() -> u32 { 4 }
fn default_chat_history_days() -> u32 { 30 }

impl Default for FactorySettings {
    fn default() -> Self {
        FactorySettings {
            agent_command: default_agent_command(),
            agent_model: String::new(),
            permission_mode: default_permission_mode(),
            default_base_branch: String::new(),
            worktree_root: String::new(),
            branch_pattern: default_branch_pattern(),
            max_concurrent_agents: default_max_agents(),
            stop_agents_on_exit: true,
            auto_resume_agents: false,
            chat_history_days: default_chat_history_days(),
            notifications: NotificationSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default = "default_parent_dir")]
    pub parent_dir: String,
    #[serde(default = "default_max_scan_depth")]
    pub max_scan_depth: u32,
    #[serde(default = "default_env_files")]
    pub env_files: Vec<String>,
    #[serde(default = "default_dev_script_priority")]
    pub dev_script_priority: Vec<String>,
    #[serde(default = "default_max_log_lines")]
    pub max_log_lines: u64,
    #[serde(default = "default_true")]
    pub show_non_node_projects: bool,
    #[serde(default)]
    pub linear_workspace: String,
    #[serde(default)]
    pub gitlab_hosts: Vec<String>,
    #[serde(default)]
    pub factory: FactorySettings,
    #[serde(default)]
    pub overrides: BTreeMap<String, ProjectOverride>,
}

fn default_parent_dir() -> String {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join("Projects").to_string_lossy().to_string()
}
fn default_max_scan_depth() -> u32 {
    3
}
fn default_env_files() -> Vec<String> {
    vec![
        ".env".into(),
        ".env.local".into(),
        ".env.development".into(),
        ".env.development.local".into(),
    ]
}
fn default_dev_script_priority() -> Vec<String> {
    vec!["dev".into(), "start".into(), "serve".into(), "develop".into()]
}
fn default_max_log_lines() -> u64 {
    2000
}
fn default_true() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            parent_dir: default_parent_dir(),
            max_scan_depth: default_max_scan_depth(),
            env_files: default_env_files(),
            dev_script_priority: default_dev_script_priority(),
            max_log_lines: default_max_log_lines(),
            show_non_node_projects: true,
            linear_workspace: String::new(),
            gitlab_hosts: Vec::new(),
            factory: FactorySettings::default(),
            overrides: BTreeMap::new(),
        }
    }
}

pub fn config_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("KABLAN_CONFIG_DIR") {
        PathBuf::from(dir)
    } else {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".kablan")
    }
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

/// Load config from disk, filling any missing field with its default (mirrors
/// the `{...DEFAULT, ...raw}` merge in the Node server).
pub fn load() -> AppConfig {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str::<AppConfig>(&raw).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

fn write(cfg: &AppConfig) {
    let dir = config_dir();
    let _ = fs::create_dir_all(&dir);
    if let Ok(s) = serde_json::to_string_pretty(cfg) {
        let _ = fs::write(config_path(), s);
    }
}

/// Apply a validated PUT patch to a config value (pure; no disk).
pub fn apply_patch(mut cfg: AppConfig, patch: &Value) -> AppConfig {
    if let Some(v) = patch.get("parentDir").and_then(|v| v.as_str()) {
        cfg.parent_dir = v.to_string();
    }
    if let Some(n) = patch.get("maxScanDepth").and_then(|v| v.as_f64()) {
        if n >= 1.0 {
            cfg.max_scan_depth = (n.floor() as u32).min(8);
        }
    }
    if let Some(arr) = patch.get("envFiles").and_then(|v| v.as_array()) {
        cfg.env_files = arr
            .iter()
            .filter_map(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }
    if let Some(arr) = patch.get("devScriptPriority").and_then(|v| v.as_array()) {
        cfg.dev_script_priority = arr
            .iter()
            .filter_map(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }
    if let Some(n) = patch.get("maxLogLines").and_then(|v| v.as_f64()) {
        if n > 0.0 {
            cfg.max_log_lines = n.floor() as u64;
        }
    }
    if let Some(b) = patch.get("showNonNodeProjects").and_then(|v| v.as_bool()) {
        cfg.show_non_node_projects = b;
    }
    if let Some(s) = patch.get("linearWorkspace").and_then(|v| v.as_str()) {
        cfg.linear_workspace = s.trim().to_string();
    }
    if let Some(f) = patch.get("factory") {
        apply_factory_patch(&mut cfg.factory, f);
    }
    cfg
}

fn apply_factory_patch(fac: &mut FactorySettings, f: &Value) {
    if let Some(s) = f.get("agentCommand").and_then(|v| v.as_str()) {
        let s = s.trim();
        if !s.is_empty() {
            fac.agent_command = s.to_string();
        }
    }
    if let Some(s) = f.get("agentModel").and_then(|v| v.as_str()) {
        fac.agent_model = s.trim().to_string();
    }
    if let Some(s) = f.get("permissionMode").and_then(|v| v.as_str()) {
        if ["default", "acceptEdits", "auto", "bypassPermissions"].contains(&s) {
            fac.permission_mode = s.to_string();
        }
    }
    if let Some(s) = f.get("defaultBaseBranch").and_then(|v| v.as_str()) {
        fac.default_base_branch = s.trim().to_string();
    }
    if let Some(s) = f.get("worktreeRoot").and_then(|v| v.as_str()) {
        fac.worktree_root = s.trim().to_string();
    }
    if let Some(s) = f.get("branchPattern").and_then(|v| v.as_str()) {
        let s = s.trim();
        if !s.is_empty() {
            fac.branch_pattern = s.to_string();
        }
    }
    if let Some(n) = f.get("maxConcurrentAgents").and_then(|v| v.as_f64()) {
        if n >= 1.0 {
            fac.max_concurrent_agents = (n.floor() as u32).min(64);
        }
    }
    if let Some(n) = f.get("chatHistoryDays").and_then(|v| v.as_f64()) {
        // 0 = keep forever; otherwise a positive day count, clamped to a sane max.
        if n >= 0.0 {
            fac.chat_history_days = (n.floor() as u32).min(3650);
        }
    }
    if let Some(b) = f.get("stopAgentsOnExit").and_then(|v| v.as_bool()) {
        fac.stop_agents_on_exit = b;
    }
    if let Some(b) = f.get("autoResumeAgents").and_then(|v| v.as_bool()) {
        fac.auto_resume_agents = b;
    }
    if let Some(n) = f.get("notifications") {
        if let Some(b) = n.get("enabled").and_then(|v| v.as_bool()) {
            fac.notifications.enabled = b;
        }
        if let Some(arr) = n.get("events").and_then(|v| v.as_array()) {
            fac.notifications.events = arr
                .iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.to_string())
                .collect();
        }
    }
}

/// Apply a validated PUT patch and persist.
pub fn save_patch(patch: &Value) -> AppConfig {
    let cfg = apply_patch(load(), patch);
    write(&cfg);
    cfg
}

/// Reset everything except per-project overrides (mirrors POST /config/reset).
pub fn reset() -> AppConfig {
    let current = load();
    let mut def = AppConfig::default();
    def.overrides = current.overrides;
    write(&def);
    def
}

pub fn set_override(project_path: &str, dev_command: Option<String>) -> AppConfig {
    let mut cfg = load();
    cfg.overrides
        .insert(project_path.to_string(), ProjectOverride { dev_command });
    write(&cfg);
    cfg
}

pub fn clear_override(project_path: &str) -> AppConfig {
    let mut cfg = load();
    cfg.overrides.remove(project_path);
    write(&cfg);
    cfg
}

pub fn add_gitlab_host(host: &str) -> AppConfig {
    let mut cfg = load();
    if !cfg.gitlab_hosts.iter().any(|h| h == host) {
        cfg.gitlab_hosts.push(host.to_string());
        write(&cfg);
    }
    cfg
}

pub fn remove_gitlab_host(host: &str) -> AppConfig {
    let mut cfg = load();
    cfg.gitlab_hosts.retain(|h| h != host);
    write(&cfg);
    cfg
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn factory_defaults_when_absent() {
        // A config with no "factory" key loads with factory defaults.
        let cfg: AppConfig = serde_json::from_str(r#"{"parentDir":"/tmp"}"#).unwrap();
        assert_eq!(cfg.factory.agent_command, "claude");
        assert_eq!(cfg.factory.max_concurrent_agents, 4);
        assert!(cfg.factory.stop_agents_on_exit);
        assert!(!cfg.factory.auto_resume_agents);
        assert_eq!(cfg.factory.permission_mode, "acceptEdits");
        assert!(cfg.factory.notifications.enabled);
        assert_eq!(cfg.factory.notifications.events, vec!["awaitingInput", "failed"]);
    }

    #[test]
    fn factory_partial_merges_defaults() {
        // A partial "factory" object keeps defaults for the fields it omits.
        let cfg: AppConfig =
            serde_json::from_str(r#"{"factory":{"maxConcurrentAgents":8}}"#).unwrap();
        assert_eq!(cfg.factory.max_concurrent_agents, 8);
        assert_eq!(cfg.factory.agent_command, "claude"); // still default
    }

    #[test]
    fn factory_camelcase_roundtrip() {
        let cfg = AppConfig::default();
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("\"maxConcurrentAgents\""));
        assert!(json.contains("\"stopAgentsOnExit\""));
    }

    #[test]
    fn apply_patch_updates_factory_fields() {
        let base = AppConfig::default();
        let patch = serde_json::json!({
            "factory": {
                "agentCommand": "/opt/homebrew/bin/claude",
                "maxConcurrentAgents": 6,
                "stopAgentsOnExit": false,
                "notifications": { "enabled": false, "events": ["done"] }
            }
        });
        let next = apply_patch(base, &patch);
        assert_eq!(next.factory.agent_command, "/opt/homebrew/bin/claude");
        assert_eq!(next.factory.max_concurrent_agents, 6);
        assert!(!next.factory.stop_agents_on_exit);
        assert!(!next.factory.notifications.enabled);
        assert_eq!(next.factory.notifications.events, vec!["done"]);
    }

    #[test]
    fn apply_patch_clamps_and_ignores_bad_values() {
        let base = AppConfig::default();
        // maxConcurrentAgents must stay >= 1; a 0 is ignored (keeps default).
        let patch = serde_json::json!({ "factory": { "maxConcurrentAgents": 0 } });
        let next = apply_patch(base, &patch);
        assert_eq!(next.factory.max_concurrent_agents, 4);
    }

    #[test]
    fn apply_patch_preserves_existing_keys() {
        let base = AppConfig::default();
        let patch = serde_json::json!({ "maxScanDepth": 5 });
        let next = apply_patch(base, &patch);
        assert_eq!(next.max_scan_depth, 5);
        assert_eq!(next.factory.agent_command, "claude"); // untouched
    }

    #[test]
    fn chat_history_days_default_is_30() {
        assert_eq!(FactorySettings::default().chat_history_days, 30);
        // Absent from JSON → default.
        let cfg: AppConfig = serde_json::from_str(r#"{"factory":{}}"#).unwrap();
        assert_eq!(cfg.factory.chat_history_days, 30);
        // Present in JSON round-trips as camelCase.
        let json = serde_json::to_string(&AppConfig::default()).unwrap();
        assert!(json.contains("\"chatHistoryDays\""));
    }

    #[test]
    fn apply_patch_sets_and_clamps_chat_history_days() {
        let base = AppConfig::default();
        // 0 is valid (keep forever).
        let zero = apply_patch(base.clone(), &serde_json::json!({"factory":{"chatHistoryDays":0}}));
        assert_eq!(zero.factory.chat_history_days, 0);
        // A normal value.
        let set = apply_patch(base.clone(), &serde_json::json!({"factory":{"chatHistoryDays":14}}));
        assert_eq!(set.factory.chat_history_days, 14);
        // Clamped to the 3650 max.
        let big = apply_patch(base.clone(), &serde_json::json!({"factory":{"chatHistoryDays":99999}}));
        assert_eq!(big.factory.chat_history_days, 3650);
        // Negative is ignored (keeps default).
        let neg = apply_patch(base, &serde_json::json!({"factory":{"chatHistoryDays":-5}}));
        assert_eq!(neg.factory.chat_history_days, 30);
    }

    #[test]
    fn factory_default_permission_mode_is_accept_edits() {
        assert_eq!(FactorySettings::default().permission_mode, "acceptEdits");
    }

    #[test]
    fn apply_patch_rejects_unknown_permission_mode_and_accepts_auto() {
        let base = AppConfig::default();
        let bad = apply_patch(base.clone(), &serde_json::json!({"factory":{"permissionMode":"plan"}}));
        assert_eq!(bad.factory.permission_mode, "acceptEdits"); // unchanged (rejected)
        let ok = apply_patch(base, &serde_json::json!({"factory":{"permissionMode":"auto"}}));
        assert_eq!(ok.factory.permission_mode, "auto");
    }
}
