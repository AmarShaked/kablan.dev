use std::path::PathBuf;

use thiserror::Error;

pub mod editor;
mod versions;

pub use editor::EditorOpenError;

pub const DEFAULT_PR_DESCRIPTION_PROMPT: &str = r#"Update the PR that was just created with a better title and description.
The PR number is #{pr_number} and the URL is {pr_url}.

Analyze the changes in this branch and write:
1. A concise, descriptive title that summarizes the changes, postfixed with "(Kablan)"
2. A detailed description that explains:
   - What changes were made
   - Why they were made (based on the task context)
   - Any important implementation details

Use the appropriate CLI tool to update the PR (gh pr edit for GitHub, az repos pr update for Azure DevOps)."#;

pub const DEFAULT_COMMIT_REMINDER_PROMPT: &str = "There are uncommitted changes. Please stage and commit them now with a descriptive commit message.";

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("Validation error: {0}")]
    ValidationError(String),
}

pub type Config = versions::v9::Config;
pub type NotificationConfig = versions::v9::NotificationConfig;
pub type EditorConfig = versions::v9::EditorConfig;
pub type ThemeMode = versions::v9::ThemeMode;
pub type SoundFile = versions::v9::SoundFile;
pub type EditorType = versions::v9::EditorType;
pub type GitHubConfig = versions::v9::GitHubConfig;
pub type UiLanguage = versions::v9::UiLanguage;
pub type ShowcaseState = versions::v9::ShowcaseState;
pub type SendMessageShortcut = versions::v9::SendMessageShortcut;
pub type TimeFormat = versions::v9::TimeFormat;
pub type IntegrationProvider = versions::v9::IntegrationProvider;
pub type LinearConfig = versions::v9::LinearConfig;

/// Will always return config, trying old schemas or eventually returning default
pub async fn load_config_from_file(config_path: &PathBuf) -> Config {
    match std::fs::read_to_string(config_path) {
        Ok(raw_config) => Config::from(raw_config),
        Err(_) => {
            tracing::info!("No config file found, creating one");
            Config::default()
        }
    }
}

/// Saves the config to the given path
pub async fn save_config_to_file(
    config: &Config,
    config_path: &PathBuf,
) -> Result<(), ConfigError> {
    let raw_config = serde_json::to_string_pretty(config)?;
    std::fs::write(config_path, raw_config)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A machine that has never run Kablan has no config file. The config we invent for it must
    /// leave both first-run gates closed, or the user never sees the disclaimer or onboarding.
    #[tokio::test]
    async fn a_missing_config_file_leaves_both_first_run_gates_closed() {
        let dir = tempfile::tempdir().unwrap();
        let config = load_config_from_file(&dir.path().join("config.json")).await;

        assert!(
            !config.disclaimer_acknowledged,
            "a fresh install must still be shown the disclaimer"
        );
        assert!(
            !config.onboarding_acknowledged,
            "a fresh install must still be shown onboarding"
        );
    }

    /// First boot writes the config straight back out (see `LocalDeployment::new`). Reading it
    /// again must not flip the gates — that would skip onboarding from the second boot onwards.
    #[tokio::test]
    async fn writing_the_first_run_config_and_reading_it_back_keeps_the_gates_closed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");

        let first_boot = load_config_from_file(&path).await;
        save_config_to_file(&first_boot, &path).await.unwrap();
        let reloaded = load_config_from_file(&path).await;

        assert_eq!(reloaded.config_version, "v9");
        assert!(!reloaded.disclaimer_acknowledged);
        assert!(!reloaded.onboarding_acknowledged);
    }

    /// An unreadable or corrupt config falls back to the default rather than to "already seen".
    #[tokio::test]
    async fn a_corrupt_config_falls_back_to_the_closed_gates() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, "{ not json").unwrap();

        let config = load_config_from_file(&path).await;

        assert!(!config.disclaimer_acknowledged);
        assert!(!config.onboarding_acknowledged);
    }

    /// Someone who did acknowledge keeps that across a reload; the gates are sticky, not pinned.
    #[tokio::test]
    async fn an_acknowledged_config_is_preserved() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");

        let config = Config {
            disclaimer_acknowledged: true,
            onboarding_acknowledged: true,
            ..Config::default()
        };
        save_config_to_file(&config, &path).await.unwrap();

        let reloaded = load_config_from_file(&path).await;
        assert!(reloaded.disclaimer_acknowledged);
        assert!(reloaded.onboarding_acknowledged);
    }
}
