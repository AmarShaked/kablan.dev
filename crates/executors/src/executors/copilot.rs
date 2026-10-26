use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::{msg_store::MsgStore, shell::resolve_executable_path_blocking};

pub use super::acp::AcpAgentHarness;
use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuildError, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
    },
};

/// The command Kablan spawns Copilot with. Shared with the availability check so the two
/// cannot drift apart.
const BASE_COMMAND: &str = "npx -y @github/copilot@0.0.403";

/// The executable Kablan actually launches. Copilot is run through `npx` at a pinned version
/// rather than from a `copilot` on PATH, so this is the program whose absence means the agent
/// cannot run at all.
fn runner_executable(command: &str) -> &str {
    command.split_whitespace().next().unwrap_or(command)
}

/// True when `~/.copilot/config.json` names an account that completed a sign-in.
/// The CLI appends to `logged_in_users` and sets `last_logged_in_user` when `/login` succeeds,
/// and removes the entry on logout. Everything else in the file — theme, trusted folders,
/// `store_token_plaintext` — survives a sign-out, which is why the file existing proves
/// nothing. The token itself lives in the system keychain, not here, so it is not the signal.
fn copilot_config_has_logged_in_user(contents: &str) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(contents) else {
        return false;
    };
    let names_an_account = |user: &serde_json::Value| {
        user.get("login")
            .and_then(|login| login.as_str())
            .is_some_and(|login| !login.trim().is_empty())
    };
    value
        .get("logged_in_users")
        .and_then(|users| users.as_array())
        .is_some_and(|users| users.iter().any(names_an_account))
        || value
            .get("last_logged_in_user")
            .is_some_and(names_an_account)
}

/// The config file's mtime. This is when the file last changed, not when the user
/// authenticated — Copilot keeps its settings in the same file, so a theme change moves this
/// timestamp without anyone signing in.
fn file_modified_unix_secs(path: &std::path::Path) -> Option<i64> {
    std::fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs() as i64)
}

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Copilot {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_all_tools: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_tool: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deny_tool: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub add_dir: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disable_mcp_server: Option<Vec<String>>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl Copilot {
    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new(BASE_COMMAND);

        if self.allow_all_tools.unwrap_or(false) {
            builder = builder.extend_params(["--allow-all-tools"]);
        }

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }

        if let Some(tool) = &self.allow_tool {
            builder = builder.extend_params(["--allow-tool", tool]);
        }

        if let Some(tool) = &self.deny_tool {
            builder = builder.extend_params(["--deny-tool", tool]);
        }

        if let Some(dirs) = &self.add_dir {
            for dir in dirs {
                builder = builder.extend_params(["--add-dir", dir]);
            }
        }

        if let Some(servers) = &self.disable_mcp_server {
            for server in servers {
                builder = builder.extend_params(["--disable-mcp-server", server]);
            }
        }

        builder = builder.extend_params(["--acp"]);

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Copilot {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let harness = AcpAgentHarness::new();
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let copilot_command = self.build_command_builder()?.build_initial()?;
        harness
            .spawn_with_command(
                current_dir,
                combined_prompt,
                copilot_command,
                env,
                &self.cmd,
                self.approvals.clone(),
            )
            .await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        _reset_to_message_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let harness = AcpAgentHarness::new();
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let copilot_command = self.build_command_builder()?.build_follow_up(&[])?;
        harness
            .spawn_follow_up_with_command(
                current_dir,
                combined_prompt,
                session_id,
                copilot_command,
                env,
                &self.cmd,
                self.approvals.clone(),
            )
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        super::acp::normalize_logs(msg_store, worktree_path);
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".copilot").join("mcp-config.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // Two separate questions, and the old check answered neither: can this agent run, and
        // is anyone signed in? A file under `~/.copilot` stood in for "installed", so a clean
        // machine with a working Copilot CLI reported NotFound while a machine that could not
        // run it at all reported InstallationFound. A login was never reported either way.
        let command = self
            .cmd
            .base_command_override
            .as_deref()
            .unwrap_or(BASE_COMMAND);
        if resolve_executable_path_blocking(runner_executable(command)).is_none() {
            return AvailabilityInfo::NotFound;
        }

        let Some(path) = dirs::home_dir().map(|home| home.join(".copilot").join("config.json"))
        else {
            return AvailabilityInfo::InstallationFound;
        };
        let Ok(contents) = std::fs::read_to_string(&path) else {
            // No config file at all: the CLI has never run here. Runnable, not signed in.
            return AvailabilityInfo::InstallationFound;
        };

        if !copilot_config_has_logged_in_user(&contents) {
            // Also the honest answer for a token supplied through COPILOT_GITHUB_TOKEN,
            // GH_TOKEN or GITHUB_TOKEN: that path writes no account to the config, so we
            // report runnable-but-no-visible-login rather than guess at a session.
            return AvailabilityInfo::InstallationFound;
        }

        match file_modified_unix_secs(&path) {
            Some(timestamp) => AvailabilityInfo::LoginDetected {
                last_auth_timestamp: timestamp,
            },
            // Signed in, but the mtime is unreadable; still better than reporting NotFound.
            None => AvailabilityInfo::InstallationFound,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn availability_checks_the_program_kablan_actually_launches() {
        // Copilot runs through npx, so npx is what has to exist — not a `copilot` binary.
        assert_eq!(runner_executable(BASE_COMMAND), "npx");

        // An override names its own program.
        assert_eq!(runner_executable("copilot --allow-all-tools"), "copilot");
        assert_eq!(runner_executable("copilot"), "copilot");
    }

    #[test]
    fn signed_in_config_names_a_logged_in_user() {
        let contents = r#"{
            "theme": "dark",
            "banner": "once",
            "last_logged_in_user": { "host": "github.com", "login": "octocat" },
            "logged_in_users": [{ "host": "github.com", "login": "octocat" }]
        }"#;
        assert!(copilot_config_has_logged_in_user(contents));
    }

    #[test]
    fn a_remaining_account_is_still_a_login() {
        // Signing out of one host clears `last_logged_in_user` but leaves the others behind.
        assert!(copilot_config_has_logged_in_user(
            r#"{"logged_in_users": [{"host": "github.example.com", "login": "octocat"}]}"#
        ));
    }

    #[test]
    fn signed_out_config_is_not_a_login() {
        // The CLI writes settings on first run and keeps them through a sign-out.
        let contents = r#"{
            "theme": "dark",
            "trusted_folders": ["/Users/dev/project"],
            "store_token_plaintext": false,
            "logged_in_users": []
        }"#;
        assert!(!copilot_config_has_logged_in_user(contents));
        assert!(!copilot_config_has_logged_in_user("{}"));
        assert!(!copilot_config_has_logged_in_user(
            r#"{"last_logged_in_user": null, "logged_in_users": []}"#
        ));
        assert!(!copilot_config_has_logged_in_user(
            r#"{"logged_in_users": [{"host": "github.com", "login": ""}]}"#
        ));
    }

    #[test]
    fn unreadable_config_is_not_a_login() {
        assert!(!copilot_config_has_logged_in_user(""));
        assert!(!copilot_config_has_logged_in_user("{ truncated"));
    }
}
