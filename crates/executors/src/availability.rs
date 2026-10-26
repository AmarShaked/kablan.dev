//! What to tell someone whose agent is not ready to run.
//!
//! `AvailabilityInfo::NotFound` cannot tell a missing CLI from a CLI that was never signed in —
//! both read the same way from outside the process. So every hint covers both: the command that
//! signs you in, and the one that installs the CLI when it is not on PATH.
//!
//! The commands here mirror `frontend/src/utils/agentConnectSteps.ts`, which walks through the
//! same steps on the agent's own page. Keep the two in step.

use crate::executors::BaseCodingAgent;

/// The terminal commands that make one agent runnable.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AgentSetupHint {
    /// What this agent is called in prose.
    pub label: &'static str,
    /// Run this and complete the login.
    pub sign_in: &'static str,
    /// Install the CLI. `None` when the install is not a single command we can print.
    pub install: Option<&'static str>,
}

impl AgentSetupHint {
    /// One sentence a person can act on without leaving the terminal they already have open.
    pub fn not_ready_message(&self) -> String {
        let install = match self.install {
            Some(install) => format!("install it with `{install}`"),
            None => format!("install the {} CLI first", self.label),
        };
        format!(
            "{} is not signed in on this machine. Open a terminal and run `{}` to sign in — if that command is not found, {}. Then start the task again.",
            self.label, self.sign_in, install
        )
    }
}

pub fn setup_hint(agent: BaseCodingAgent) -> AgentSetupHint {
    match agent {
        BaseCodingAgent::ClaudeCode => AgentSetupHint {
            label: "Claude Code",
            sign_in: "claude",
            install: Some("npm i -g @anthropic-ai/claude-code"),
        },
        BaseCodingAgent::Amp => AgentSetupHint {
            label: "Amp",
            sign_in: "amp",
            install: None,
        },
        BaseCodingAgent::Gemini => AgentSetupHint {
            label: "Gemini",
            sign_in: "gemini",
            install: Some("npm i -g @google/gemini-cli"),
        },
        #[cfg(feature = "codex")]
        BaseCodingAgent::Codex => AgentSetupHint {
            label: "Codex",
            sign_in: "codex login",
            install: Some("npm i -g @openai/codex"),
        },
        BaseCodingAgent::Opencode => AgentSetupHint {
            label: "OpenCode",
            sign_in: "opencode",
            install: None,
        },
        BaseCodingAgent::CursorAgent => AgentSetupHint {
            label: "Cursor Agent",
            sign_in: "cursor-agent login",
            install: None,
        },
        BaseCodingAgent::QwenCode => AgentSetupHint {
            label: "Qwen Code",
            sign_in: "qwen",
            install: None,
        },
        BaseCodingAgent::Copilot => AgentSetupHint {
            label: "Copilot",
            sign_in: "gh copilot",
            install: None,
        },
        BaseCodingAgent::Droid => AgentSetupHint {
            label: "Droid",
            sign_in: "droid",
            install: None,
        },
        // The mock has nothing to sign in to — it reports itself available, so this never
        // reaches anyone. It exists so the match stays total.
        #[cfg(feature = "qa-mode")]
        BaseCodingAgent::QaMock => AgentSetupHint {
            label: "QA Mock",
            sign_in: "true",
            install: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use strum::VariantNames;

    use super::*;

    fn every_agent() -> Vec<BaseCodingAgent> {
        crate::executors::CodingAgent::VARIANTS
            .iter()
            .map(|name| {
                name.parse::<BaseCodingAgent>()
                    .unwrap_or_else(|_| panic!("{name} should parse as a BaseCodingAgent"))
            })
            .collect()
    }

    #[test]
    fn every_agent_has_a_command_to_run() {
        for agent in every_agent() {
            let hint = setup_hint(agent);
            assert!(!hint.label.is_empty(), "{agent} needs a label");
            assert!(!hint.sign_in.is_empty(), "{agent} needs a sign-in command");
        }
    }

    /// The message a stranger sees instead of a failed run. `/login` is a Claude Code slash
    /// command that cannot be typed anywhere in Kablan, so it must not appear.
    #[test]
    fn the_message_names_a_terminal_command_and_never_a_slash_command() {
        let message = setup_hint(BaseCodingAgent::ClaudeCode).not_ready_message();
        assert!(message.contains("Claude Code"), "{message}");
        assert!(message.contains("run `claude`"), "{message}");
        assert!(
            message.contains("npm i -g @anthropic-ai/claude-code"),
            "{message}"
        );
        assert!(!message.contains("/login"), "{message}");
    }

    #[test]
    fn an_agent_without_a_one_line_install_still_says_what_to_install() {
        let message = setup_hint(BaseCodingAgent::Amp).not_ready_message();
        assert!(message.contains("run `amp`"), "{message}");
        assert!(message.contains("install the Amp CLI first"), "{message}");
    }
}
