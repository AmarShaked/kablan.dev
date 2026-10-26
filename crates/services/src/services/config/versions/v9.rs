use executors::{
    executors::BaseCodingAgent,
    selection::{AgentRunSelection, selection_from_legacy},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;
pub use v8::{
    EditorConfig, EditorType, GitHubConfig, IntegrationProvider, LinearConfig, NotificationConfig,
    SendMessageShortcut, ShowcaseState, SoundFile, ThemeMode, TimeFormat, UiLanguage,
};

use crate::services::config::versions::v8;

fn default_git_branch_prefix() -> String {
    "kablan".to_string()
}

fn default_pr_auto_description_enabled() -> bool {
    true
}

fn default_commit_reminder_enabled() -> bool {
    true
}

fn default_archive_tasks_after_days() -> Option<u32> {
    Some(7)
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Config {
    pub config_version: String,
    pub theme: ThemeMode,
    pub last_agent_selection: AgentRunSelection,
    #[serde(default)]
    pub enabled_agents: Option<Vec<BaseCodingAgent>>,
    pub disclaimer_acknowledged: bool,
    pub onboarding_acknowledged: bool,
    pub notifications: NotificationConfig,
    pub editor: EditorConfig,
    pub github: GitHubConfig,
    #[serde(default)]
    pub linear: LinearConfig,
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
    #[serde(default = "default_commit_reminder_enabled")]
    pub commit_reminder_enabled: bool,
    #[serde(default)]
    pub commit_reminder_prompt: Option<String>,
    #[serde(default)]
    pub send_message_shortcut: SendMessageShortcut,
    #[serde(default = "default_archive_tasks_after_days")]
    pub archive_tasks_after_days: Option<u32>,
    #[serde(default)]
    pub time_format: TimeFormat,
    #[serde(default)]
    pub enabled_integrations: Vec<IntegrationProvider>,
    #[serde(default)]
    pub connected_integrations: Vec<IntegrationProvider>,
}

impl Config {
    pub fn from_v8(old: v8::Config, profiles: Option<&Value>) -> Self {
        Self {
            config_version: "v9".to_string(),
            theme: old.theme,
            last_agent_selection: selection_from_legacy(
                old.executor_profile.executor,
                old.executor_profile.variant.as_deref(),
                profiles,
            ),
            enabled_agents: old.enabled_agents,
            disclaimer_acknowledged: old.disclaimer_acknowledged,
            onboarding_acknowledged: old.onboarding_acknowledged,
            notifications: old.notifications,
            editor: old.editor,
            github: old.github,
            linear: old.linear,
            workspace_dir: old.workspace_dir,
            last_app_version: old.last_app_version,
            show_release_notes: old.show_release_notes,
            language: old.language,
            git_branch_prefix: old.git_branch_prefix,
            showcases: old.showcases,
            pr_auto_description_enabled: old.pr_auto_description_enabled,
            pr_auto_description_prompt: old.pr_auto_description_prompt,
            commit_reminder_enabled: old.commit_reminder_enabled,
            commit_reminder_prompt: old.commit_reminder_prompt,
            send_message_shortcut: old.send_message_shortcut,
            archive_tasks_after_days: old.archive_tasks_after_days,
            time_format: old.time_format,
            enabled_integrations: old.enabled_integrations,
            connected_integrations: old.connected_integrations,
        }
    }
}

impl From<String> for Config {
    fn from(raw_config: String) -> Self {
        let raw_config = v8::retire_missing_executors(raw_config);
        if let Ok(config) = serde_json::from_str::<Config>(&raw_config)
            && config.config_version == "v9"
        {
            return config;
        }
        let old = v8::Config::from(raw_config);
        Self::from_v8(old, None)
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            config_version: "v9".to_string(),
            theme: ThemeMode::System,
            last_agent_selection: AgentRunSelection::first_run(),
            enabled_agents: None,
            disclaimer_acknowledged: false,
            onboarding_acknowledged: false,
            notifications: NotificationConfig::default(),
            editor: EditorConfig::default(),
            github: GitHubConfig::default(),
            linear: LinearConfig::default(),
            workspace_dir: None,
            last_app_version: None,
            show_release_notes: false,
            language: UiLanguage::default(),
            git_branch_prefix: default_git_branch_prefix(),
            showcases: ShowcaseState::default(),
            pr_auto_description_enabled: true,
            pr_auto_description_prompt: None,
            commit_reminder_enabled: true,
            commit_reminder_prompt: None,
            send_message_shortcut: SendMessageShortcut::default(),
            archive_tasks_after_days: default_archive_tasks_after_days(),
            time_format: TimeFormat::default(),
            enabled_integrations: Vec::new(),
            connected_integrations: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use executors::{profile::ExecutorProfileId, selection::PermissionLevel};

    #[test]
    fn v8_plan_profile_without_a_profiles_file_becomes_plan() {
        let old = v8::Config {
            executor_profile: ExecutorProfileId::with_variant(
                BaseCodingAgent::ClaudeCode,
                "PLAN".to_string(),
            ),
            ..v8::Config::default()
        };
        let migrated = Config::from_v8(old, None);
        assert_eq!(migrated.config_version, "v9");
        assert_eq!(
            migrated.last_agent_selection.permission,
            PermissionLevel::Plan
        );
        assert!(migrated.last_agent_selection.model.is_none());
    }

    #[test]
    fn v8_pinned_model_is_kept_from_profiles_json() {
        let old = v8::Config {
            executor_profile: ExecutorProfileId::with_variant(
                BaseCodingAgent::ClaudeCode,
                "FABLE_5_1".to_string(),
            ),
            ..v8::Config::default()
        };
        let profiles = serde_json::json!({
            "executors": {
                "CLAUDE_CODE": {
                    "FABLE_5_1": {
                        "CLAUDE_CODE": {
                            "dangerously_skip_permissions": true,
                            "model": "claude-fable-5-1"
                        }
                    }
                }
            }
        });
        let migrated = Config::from_v8(old, Some(&profiles));
        assert_eq!(
            migrated.last_agent_selection.model.as_deref(),
            Some("claude-fable-5-1")
        );
        assert_eq!(
            migrated.last_agent_selection.permission,
            PermissionLevel::Bypass
        );
    }

    #[test]
    fn approvals_variant_without_a_matching_profile_is_manual() {
        let raw = serde_json::to_string(&v8::Config {
            executor_profile: ExecutorProfileId::with_variant(
                BaseCodingAgent::Gemini,
                "APPROVALS".to_string(),
            ),
            ..v8::Config::default()
        })
        .unwrap();
        let migrated = Config::from(raw);
        assert_eq!(
            migrated.last_agent_selection.executor,
            BaseCodingAgent::Gemini
        );
        assert_eq!(
            migrated.last_agent_selection.permission,
            PermissionLevel::Manual
        );
    }
}
