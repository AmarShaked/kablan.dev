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

/// The command Kablan spawns Gemini with. Shared with the availability check so the two
/// cannot drift apart.
const BASE_COMMAND: &str = "npx -y @google/gemini-cli@0.27.0";

/// The executable Kablan actually launches. Gemini is run through `npx` at a pinned version
/// rather than from a `gemini` on PATH, so this is the program whose absence means the agent
/// cannot run at all.
fn runner_executable(command: &str) -> &str {
    command.split_whitespace().next().unwrap_or(command)
}

/// True when `~/.gemini/oauth_creds.json` carries a token from a completed sign-in.
/// The CLI writes this file once the OAuth exchange succeeds and removes it on logout, but a
/// truncated or emptied file still parses, so the tokens themselves are what we check.
fn gemini_oauth_creds_have_token(contents: &str) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(contents) else {
        return false;
    };
    ["access_token", "refresh_token"].iter().any(|key| {
        value
            .get(key)
            .and_then(|token| token.as_str())
            .is_some_and(|token| !token.trim().is_empty())
    })
}

/// The auth file's mtime. This is when the file last changed, not when the user
/// authenticated — the two coincide at login and drift apart afterwards.
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
pub struct Gemini {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub yolo: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl Gemini {
    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new(BASE_COMMAND);

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model.as_str()]);
        }

        if self.yolo.unwrap_or(false) {
            builder = builder.extend_params(["--yolo"]);
            builder = builder.extend_params(["--allowed-tools", "run_shell_command"]);
        }

        builder = builder.extend_params(["--experimental-acp"]);

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Gemini {
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
        let gemini_command = self.build_command_builder()?.build_initial()?;
        let approvals = if self.yolo.unwrap_or(false) {
            None
        } else {
            self.approvals.clone()
        };
        harness
            .spawn_with_command(
                current_dir,
                combined_prompt,
                gemini_command,
                env,
                &self.cmd,
                approvals,
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
        let gemini_command = self.build_command_builder()?.build_follow_up(&[])?;
        let approvals = if self.yolo.unwrap_or(false) {
            None
        } else {
            self.approvals.clone()
        };
        harness
            .spawn_follow_up_with_command(
                current_dir,
                combined_prompt,
                session_id,
                gemini_command,
                env,
                &self.cmd,
                approvals,
            )
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        super::acp::normalize_logs(msg_store, worktree_path);
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".gemini").join("settings.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // Two separate questions, and the old check answered neither: can this agent run, and
        // is anyone signed in? Files under `~/.gemini` stood in for both, so a clean machine
        // with a working Gemini CLI reported NotFound, and a stale `oauth_creds.json` on a
        // machine that could not run it reported LoginDetected.
        let command = self
            .cmd
            .base_command_override
            .as_deref()
            .unwrap_or(BASE_COMMAND);
        if resolve_executable_path_blocking(runner_executable(command)).is_none() {
            return AvailabilityInfo::NotFound;
        }

        let Some(path) = dirs::home_dir().map(|home| home.join(".gemini").join("oauth_creds.json"))
        else {
            return AvailabilityInfo::InstallationFound;
        };
        let Ok(contents) = std::fs::read_to_string(&path) else {
            // No creds file: nobody has signed in here, or they authenticated by a route that
            // writes none — GEMINI_API_KEY, Vertex application default credentials, or the
            // CLI's encrypted credential storage. Runnable, with no login we can see.
            return AvailabilityInfo::InstallationFound;
        };

        if !gemini_oauth_creds_have_token(&contents) {
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
        // Gemini runs through npx, so npx is what has to exist — not a `gemini` binary.
        assert_eq!(runner_executable(BASE_COMMAND), "npx");

        // An override names its own program.
        assert_eq!(runner_executable("gemini --yolo"), "gemini");
        assert_eq!(runner_executable("gemini"), "gemini");
    }

    #[test]
    fn signed_in_oauth_creds_carry_a_token() {
        let contents = r#"{
            "access_token": "ya29.a0AUMWg",
            "refresh_token": "1//034I5uwNk",
            "scope": "https://www.googleapis.com/auth/cloud-platform",
            "token_type": "Bearer",
            "expiry_date": 1769953832151
        }"#;
        assert!(gemini_oauth_creds_have_token(contents));
    }

    #[test]
    fn a_refresh_token_alone_is_still_a_login() {
        // An expired access token is dropped on refresh; the refresh token is what persists.
        assert!(gemini_oauth_creds_have_token(
            r#"{"refresh_token": "1//034I5uwNk", "token_type": "Bearer"}"#
        ));
    }

    #[test]
    fn emptied_oauth_creds_are_not_a_login() {
        assert!(!gemini_oauth_creds_have_token("{}"));
        assert!(!gemini_oauth_creds_have_token(
            r#"{"token_type": "Bearer"}"#
        ));
        assert!(!gemini_oauth_creds_have_token(r#"{"access_token": ""}"#));
        assert!(!gemini_oauth_creds_have_token(r#"{"access_token": "   "}"#));
        assert!(!gemini_oauth_creds_have_token(r#"{"access_token": null}"#));
    }

    #[test]
    fn unreadable_oauth_creds_are_not_a_login() {
        assert!(!gemini_oauth_creds_have_token(""));
        assert!(!gemini_oauth_creds_have_token("{ truncated"));
    }
}
