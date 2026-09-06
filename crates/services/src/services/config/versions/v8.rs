use anyhow::Error;
use executors::{executors::BaseCodingAgent, profile::ExecutorProfileId};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
pub use v7::{
    EditorConfig, EditorType, GitHubConfig, NotificationConfig, ShowcaseState, SoundFile,
    ThemeMode, UiLanguage,
};

use crate::services::config::versions::v7;

fn default_git_branch_prefix() -> String {
    // Kablan fork: branches are created as "<prefix>/<id>-<slug>"; upstream's default was "vk".
    "kablan".to_string()
}

fn default_pr_auto_description_enabled() -> bool {
    true
}

fn default_commit_reminder_enabled() -> bool {
    true
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, TS, PartialEq, Eq)]
pub enum SendMessageShortcut {
    #[default]
    ModifierEnter,
    Enter,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Config {
    pub config_version: String,
    pub theme: ThemeMode,
    pub executor_profile: ExecutorProfileId,
    /// Agents the user has added in Settings. None means not yet chosen — the app
    /// seeds from connected agents plus the current default on first load.
    #[serde(default)]
    pub enabled_agents: Option<Vec<BaseCodingAgent>>,
    pub disclaimer_acknowledged: bool,
    pub onboarding_acknowledged: bool,
    pub notifications: NotificationConfig,
    pub editor: EditorConfig,
    pub github: GitHubConfig,
    pub workspace_dir: Option<String>,
    pub last_app_version: Option<String>,
    pub show_release_notes: bool,
    #[serde(default)]
    pub language: UiLanguage,
    #[serde(default = "default_git_branch_prefix")]
    pub git_branch_prefix: String,
    #[serde(default)]
    pub showcases: ShowcaseState,
    #[serde(default = "default_pr_auto_description_enabled")]
    pub pr_auto_description_enabled: bool,
    #[serde(default)]
    pub pr_auto_description_prompt: Option<String>,
    #[serde(default)]
    pub beta_workspaces: bool,
    #[serde(default)]
    pub beta_workspaces_invitation_sent: bool,
    #[serde(default = "default_commit_reminder_enabled")]
    pub commit_reminder_enabled: bool,
    #[serde(default)]
    pub commit_reminder_prompt: Option<String>,
    #[serde(default)]
    pub send_message_shortcut: SendMessageShortcut,
    /// Days a task stays in the views after it is done or cancelled, before it is archived out of
    /// them. None turns automatic archiving off; archiving by hand still works.
    ///
    /// Defaulted rather than versioned: a config written before this existed reads as the same
    /// seven days a new one gets, so nothing has to migrate.
    #[serde(default = "default_archive_tasks_after_days")]
    pub archive_tasks_after_days: Option<u32>,
}

fn default_archive_tasks_after_days() -> Option<u32> {
    Some(7)
}

impl Config {
    fn from_v7_config(old_config: v7::Config) -> Self {
        Self {
            archive_tasks_after_days: default_archive_tasks_after_days(),
            config_version: "v8".to_string(),
            theme: old_config.theme,
            executor_profile: old_config.executor_profile,
            enabled_agents: None,
            disclaimer_acknowledged: old_config.disclaimer_acknowledged,
            onboarding_acknowledged: old_config.onboarding_acknowledged,
            notifications: old_config.notifications,
            editor: old_config.editor,
            github: old_config.github,
            workspace_dir: old_config.workspace_dir,
            last_app_version: old_config.last_app_version,
            show_release_notes: old_config.show_release_notes,
            language: old_config.language,
            git_branch_prefix: old_config.git_branch_prefix,
            showcases: old_config.showcases,
            pr_auto_description_enabled: true,
            pr_auto_description_prompt: None,
            beta_workspaces: false,
            beta_workspaces_invitation_sent: false,
            commit_reminder_enabled: true,
            commit_reminder_prompt: None,
            send_message_shortcut: SendMessageShortcut::default(),
        }
    }

    pub fn from_previous_version(raw_config: &str) -> Result<Self, Error> {
        let old_config = v7::Config::from(raw_config.to_string());
        Ok(Self::from_v7_config(old_config))
    }
}

/// Rewrite an executor this build no longer has into one it does.
///
/// Codex is compiled out by default (see crates/executors). A config that still names it fails
/// to deserialize, and the fallback for a config that fails to deserialize is *every* setting
/// reset — theme, GitHub, editor, the lot. One agent going away should not cost someone their
/// whole configuration, so it is renamed on the way in and saved back on the next write.
#[cfg(not(feature = "codex"))]
fn retire_missing_executors(raw_config: String) -> String {
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&raw_config) else {
        return raw_config;
    };

    fn walk(value: &mut serde_json::Value) {
        match value {
            serde_json::Value::Object(map) => {
                if let Some(serde_json::Value::String(executor)) = map.get("executor")
                    && executor == "CODEX"
                {
                    map.insert("executor".to_string(), "CLAUDE_CODE".into());
                }
                for (_, v) in map.iter_mut() {
                    walk(v);
                }
            }
            serde_json::Value::Array(items) => items.iter_mut().for_each(walk),
            _ => {}
        }
    }

    walk(&mut value);
    serde_json::to_string(&value).unwrap_or(raw_config)
}

#[cfg(feature = "codex")]
fn retire_missing_executors(raw_config: String) -> String {
    raw_config
}

impl From<String> for Config {
    fn from(raw_config: String) -> Self {
        let raw_config = retire_missing_executors(raw_config);
        if let Ok(config) = serde_json::from_str::<Config>(&raw_config)
            && config.config_version == "v8"
        {
            return config;
        }

        match Self::from_previous_version(&raw_config) {
            Ok(config) => {
                tracing::info!("Config upgraded to v8");
                config
            }
            Err(e) => {
                tracing::warn!("Config migration failed: {}, using default", e);
                Self::default()
            }
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            archive_tasks_after_days: default_archive_tasks_after_days(),
            config_version: "v8".to_string(),
            theme: ThemeMode::System,
            executor_profile: ExecutorProfileId::new(BaseCodingAgent::ClaudeCode),
            enabled_agents: None,
            disclaimer_acknowledged: false,
            onboarding_acknowledged: false,
            notifications: NotificationConfig::default(),
            editor: EditorConfig::default(),
            github: GitHubConfig::default(),
            workspace_dir: None,
            last_app_version: None,
            show_release_notes: false,
            language: UiLanguage::default(),
            git_branch_prefix: default_git_branch_prefix(),
            showcases: ShowcaseState::default(),
            pr_auto_description_enabled: true,
            pr_auto_description_prompt: None,
            beta_workspaces: false,
            beta_workspaces_invitation_sent: false,
            commit_reminder_enabled: true,
            commit_reminder_prompt: None,
            send_message_shortcut: SendMessageShortcut::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_enabled_agents_deserializes_as_none() {
        let mut value = serde_json::to_value(Config::default()).unwrap();
        value
            .as_object_mut()
            .expect("config json is an object")
            .remove("enabled_agents");
        let config: Config = serde_json::from_value(value).unwrap();
        assert_eq!(config.enabled_agents, None);
    }
}
