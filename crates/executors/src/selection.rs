use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::{
    executors::{BaseCodingAgent, CodingAgent},
    profile::{ExecutorConfigs, ExecutorProfileId},
};

/// How freely an agent may act on a run.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(use_ts_enum)]
pub enum PermissionLevel {
    Auto,
    Manual,
    AcceptEdits,
    Plan,
    Bypass,
}

/// Agent, model, and permission for one run. `model: None` is the agent's own default.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
pub struct AgentRunSelection {
    pub executor: BaseCodingAgent,
    pub model: Option<String>,
    pub permission: PermissionLevel,
}

impl AgentRunSelection {
    pub fn first_run() -> Self {
        Self {
            executor: BaseCodingAgent::ClaudeCode,
            model: None,
            permission: PermissionLevel::Bypass,
        }
    }
}

pub fn agent_json_key(agent: BaseCodingAgent) -> &'static str {
    match agent {
        BaseCodingAgent::ClaudeCode => "CLAUDE_CODE",
        BaseCodingAgent::Amp => "AMP",
        BaseCodingAgent::Gemini => "GEMINI",
        #[cfg(feature = "codex")]
        BaseCodingAgent::Codex => "CODEX",
        BaseCodingAgent::Opencode => "OPENCODE",
        BaseCodingAgent::CursorAgent => "CURSOR_AGENT",
        BaseCodingAgent::QwenCode => "QWEN_CODE",
        BaseCodingAgent::Copilot => "COPILOT",
        BaseCodingAgent::Droid => "DROID",
        #[cfg(feature = "qa-mode")]
        BaseCodingAgent::QaMock => "QA_MOCK",
    }
}

pub fn supported_permissions(agent: BaseCodingAgent) -> &'static [PermissionLevel] {
    use PermissionLevel::*;
    match agent {
        BaseCodingAgent::ClaudeCode => &[Auto, Manual, AcceptEdits, Plan, Bypass],
        #[cfg(feature = "codex")]
        BaseCodingAgent::Codex => &[Auto, Manual, AcceptEdits, Bypass],
        BaseCodingAgent::Gemini
        | BaseCodingAgent::QwenCode
        | BaseCodingAgent::Amp
        | BaseCodingAgent::CursorAgent
        | BaseCodingAgent::Copilot => &[Manual, Bypass],
        BaseCodingAgent::Opencode => &[Manual, Plan, Bypass],
        BaseCodingAgent::Droid => &[Auto, Manual, AcceptEdits, Bypass],
        #[cfg(feature = "qa-mode")]
        BaseCodingAgent::QaMock => &[Manual, Bypass],
    }
}

/// Keep `current` when this agent offers it. Otherwise Manual.
pub fn adjust_permission(agent: BaseCodingAgent, current: PermissionLevel) -> PermissionLevel {
    if supported_permissions(agent).contains(&current) {
        current
    } else {
        PermissionLevel::Manual
    }
}

pub fn selection_asks_in_app(selection: &AgentRunSelection) -> bool {
    let permission = adjust_permission(selection.executor, selection.permission);
    matches!(
        (selection.executor, permission),
        (BaseCodingAgent::ClaudeCode, PermissionLevel::Manual)
            | (BaseCodingAgent::Gemini, PermissionLevel::Manual)
            | (BaseCodingAgent::QwenCode, PermissionLevel::Manual)
            | (BaseCodingAgent::Copilot, PermissionLevel::Manual)
    )
}

/// New runs pass `selection`. Older stored actions only have a profile id.
pub fn resolve_coding_agent(
    selection: Option<&AgentRunSelection>,
    profile: &ExecutorProfileId,
) -> Result<CodingAgent, String> {
    if let Some(selection) = selection {
        return coding_agent_from_selection(selection);
    }
    Ok(ExecutorConfigs::get_cached().get_coding_agent_or_default(profile))
}

pub fn coding_agent_from_selection(selection: &AgentRunSelection) -> Result<CodingAgent, String> {
    let permission = adjust_permission(selection.executor, selection.permission);
    let mut fields = serde_json::Map::new();
    if let Some(model) = selection.model.as_deref().filter(|model| !model.is_empty()) {
        fields.insert("model".to_string(), Value::String(model.to_string()));
    }
    apply_permission_fields(selection.executor, permission, &mut fields);
    let value = Value::Object({
        let mut tagged = serde_json::Map::new();
        tagged.insert(
            agent_json_key(selection.executor).to_string(),
            Value::Object(fields),
        );
        tagged
    });
    serde_json::from_value(value).map_err(|err| err.to_string())
}

fn apply_permission_fields(
    agent: BaseCodingAgent,
    permission: PermissionLevel,
    fields: &mut serde_json::Map<String, Value>,
) {
    use PermissionLevel::*;
    match (agent, permission) {
        (BaseCodingAgent::ClaudeCode, Auto) => {
            fields.insert(
                "requested_permission_mode".to_string(),
                Value::String("auto".to_string()),
            );
        }
        (BaseCodingAgent::ClaudeCode, Manual) => {
            fields.insert("approvals".to_string(), Value::Bool(true));
        }
        (BaseCodingAgent::ClaudeCode, AcceptEdits) => {
            fields.insert(
                "requested_permission_mode".to_string(),
                Value::String("acceptEdits".to_string()),
            );
        }
        (BaseCodingAgent::ClaudeCode, Plan) => {
            fields.insert(
                "requested_permission_mode".to_string(),
                Value::String("plan".to_string()),
            );
        }
        (BaseCodingAgent::ClaudeCode, Bypass) => {
            fields.insert(
                "dangerously_skip_permissions".to_string(),
                Value::Bool(true),
            );
        }
        #[cfg(feature = "codex")]
        (BaseCodingAgent::Codex, Auto) => {
            fields.insert("sandbox".to_string(), Value::String("auto".to_string()));
            fields.insert(
                "ask_for_approval".to_string(),
                Value::String("on-request".to_string()),
            );
        }
        #[cfg(feature = "codex")]
        (BaseCodingAgent::Codex, Manual) => {
            fields.insert(
                "sandbox".to_string(),
                Value::String("workspace-write".to_string()),
            );
            fields.insert(
                "ask_for_approval".to_string(),
                Value::String("unless-trusted".to_string()),
            );
        }
        #[cfg(feature = "codex")]
        (BaseCodingAgent::Codex, AcceptEdits) => {
            fields.insert(
                "sandbox".to_string(),
                Value::String("workspace-write".to_string()),
            );
            fields.insert(
                "ask_for_approval".to_string(),
                Value::String("on-failure".to_string()),
            );
        }
        #[cfg(feature = "codex")]
        (BaseCodingAgent::Codex, Bypass) => {
            fields.insert(
                "sandbox".to_string(),
                Value::String("danger-full-access".to_string()),
            );
            fields.insert(
                "ask_for_approval".to_string(),
                Value::String("never".to_string()),
            );
        }
        (BaseCodingAgent::Gemini | BaseCodingAgent::QwenCode, Manual) => {
            fields.insert("yolo".to_string(), Value::Bool(false));
        }
        (BaseCodingAgent::Gemini | BaseCodingAgent::QwenCode, Bypass) => {
            fields.insert("yolo".to_string(), Value::Bool(true));
        }
        (BaseCodingAgent::Amp, Manual) => {
            fields.insert("dangerously_allow_all".to_string(), Value::Bool(false));
        }
        (BaseCodingAgent::Amp, Bypass) => {
            fields.insert("dangerously_allow_all".to_string(), Value::Bool(true));
        }
        (BaseCodingAgent::Opencode, Manual) => {
            fields.insert("auto_approve".to_string(), Value::Bool(false));
        }
        (BaseCodingAgent::Opencode, Plan) => {
            fields.insert("agent".to_string(), Value::String("plan".to_string()));
            fields.insert("auto_approve".to_string(), Value::Bool(true));
        }
        (BaseCodingAgent::Opencode, Bypass) => {
            fields.insert("auto_approve".to_string(), Value::Bool(true));
        }
        (BaseCodingAgent::CursorAgent, Manual) => {
            fields.insert("force".to_string(), Value::Bool(false));
        }
        (BaseCodingAgent::CursorAgent, Bypass) => {
            fields.insert("force".to_string(), Value::Bool(true));
        }
        (BaseCodingAgent::Copilot, Manual) => {
            fields.insert("allow_all_tools".to_string(), Value::Bool(false));
        }
        (BaseCodingAgent::Copilot, Bypass) => {
            fields.insert("allow_all_tools".to_string(), Value::Bool(true));
        }
        (BaseCodingAgent::Droid, Auto) => {
            fields.insert("autonomy".to_string(), Value::String("high".to_string()));
        }
        (BaseCodingAgent::Droid, Manual) => {
            fields.insert("autonomy".to_string(), Value::String("normal".to_string()));
        }
        (BaseCodingAgent::Droid, AcceptEdits) => {
            fields.insert("autonomy".to_string(), Value::String("medium".to_string()));
        }
        (BaseCodingAgent::Droid, Bypass) => {
            fields.insert(
                "autonomy".to_string(),
                Value::String("skip-permissions-unsafe".to_string()),
            );
        }
        _ => {}
    }
}

/// Read an old profile id. `profiles` is the saved `profiles.json` document, if it is still there.
pub fn selection_from_legacy(
    executor: BaseCodingAgent,
    variant: Option<&str>,
    profiles: Option<&Value>,
) -> AgentRunSelection {
    let variant_name = variant.unwrap_or("DEFAULT");
    let fields = profiles.and_then(|profiles| agent_fields(profiles, executor, variant_name));
    let model = fields.and_then(model_field);
    let permission = permission_from_saved(variant_name, fields);
    AgentRunSelection {
        executor,
        model,
        permission,
    }
}

fn agent_fields<'a>(
    profiles: &'a Value,
    executor: BaseCodingAgent,
    variant: &str,
) -> Option<&'a Value> {
    let tagged = profiles
        .get("executors")?
        .get(agent_json_key(executor))?
        .get(variant)?;
    tagged.get(agent_json_key(executor)).or(Some(tagged))
}

fn model_field(fields: &Value) -> Option<String> {
    fields
        .get("model")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|model| !model.is_empty())
        .map(str::to_string)
}

fn permission_from_saved(variant_name: &str, fields: Option<&Value>) -> PermissionLevel {
    if let Some(fields) = fields {
        if flag(fields, "plan")
            || text_is(fields, "agent", "plan")
            || text_is(fields, "mode", "plan")
        {
            return PermissionLevel::Plan;
        }
        if flag(fields, "approvals")
            || flag_is(fields, "yolo", false)
            || flag_is(fields, "auto_approve", false)
            || flag_is(fields, "force", false)
        {
            return PermissionLevel::Manual;
        }
        if flag(fields, "dangerously_skip_permissions")
            || flag(fields, "yolo")
            || flag(fields, "force")
            || flag(fields, "allow_all_tools")
            || flag(fields, "dangerously_allow_all")
            || text_is(fields, "autonomy", "skip-permissions-unsafe")
        {
            return PermissionLevel::Bypass;
        }
    }
    match variant_name {
        "PLAN" => PermissionLevel::Plan,
        "APPROVALS" => PermissionLevel::Manual,
        _ => PermissionLevel::Bypass,
    }
}

fn flag(fields: &Value, key: &str) -> bool {
    flag_is(fields, key, true)
}

fn flag_is(fields: &Value, key: &str, expected: bool) -> bool {
    fields.get(key).and_then(Value::as_bool) == Some(expected)
}

fn text_is(fields: &Value, key: &str, expected: &str) -> bool {
    fields.get(key).and_then(Value::as_str) == Some(expected)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::executors::{
        amp::Amp, claude::ClaudeCode, copilot::Copilot, cursor::CursorAgent, droid::Droid,
        gemini::Gemini, opencode::Opencode, qwen::QwenCode,
    };

    fn selection(executor: BaseCodingAgent, permission: PermissionLevel) -> AgentRunSelection {
        AgentRunSelection {
            executor,
            model: None,
            permission,
        }
    }

    #[test]
    fn every_supported_mode_sets_the_field_the_agent_already_understands() {
        let cases = [
            (BaseCodingAgent::ClaudeCode, PermissionLevel::Auto),
            (BaseCodingAgent::ClaudeCode, PermissionLevel::Manual),
            (BaseCodingAgent::ClaudeCode, PermissionLevel::AcceptEdits),
            (BaseCodingAgent::ClaudeCode, PermissionLevel::Plan),
            (BaseCodingAgent::ClaudeCode, PermissionLevel::Bypass),
            (BaseCodingAgent::Gemini, PermissionLevel::Manual),
            (BaseCodingAgent::Gemini, PermissionLevel::Bypass),
            (BaseCodingAgent::Amp, PermissionLevel::Bypass),
            (BaseCodingAgent::Opencode, PermissionLevel::Plan),
            (BaseCodingAgent::CursorAgent, PermissionLevel::Manual),
            (BaseCodingAgent::Copilot, PermissionLevel::Bypass),
            (BaseCodingAgent::Droid, PermissionLevel::Auto),
            (BaseCodingAgent::QwenCode, PermissionLevel::Manual),
        ];
        for (executor, permission) in cases {
            assert!(
                supported_permissions(executor).contains(&permission),
                "{executor} should offer {permission:?}"
            );
            coding_agent_from_selection(&selection(executor, permission))
                .unwrap_or_else(|err| panic!("{executor} {permission:?}: {err}"));
        }
    }

    #[test]
    fn claude_plan_does_not_set_bypass_and_bypass_does_not_ask_in_app() {
        let plan = coding_agent_from_selection(&selection(
            BaseCodingAgent::ClaudeCode,
            PermissionLevel::Plan,
        ))
        .unwrap();
        let CodingAgent::ClaudeCode(ClaudeCode {
            requested_permission_mode,
            dangerously_skip_permissions,
            approvals,
            ..
        }) = plan
        else {
            panic!("expected claude");
        };
        assert_eq!(requested_permission_mode.as_deref(), Some("plan"));
        assert_ne!(dangerously_skip_permissions, Some(true));
        assert_ne!(approvals, Some(true));

        let bypass = selection(BaseCodingAgent::ClaudeCode, PermissionLevel::Bypass);
        assert!(!selection_asks_in_app(&bypass));
        let CodingAgent::ClaudeCode(ClaudeCode {
            dangerously_skip_permissions,
            ..
        }) = coding_agent_from_selection(&bypass).unwrap()
        else {
            panic!("expected claude");
        };
        assert_eq!(dangerously_skip_permissions, Some(true));
    }

    #[test]
    fn claude_manual_asks_in_the_app() {
        let manual = selection(BaseCodingAgent::ClaudeCode, PermissionLevel::Manual);
        assert!(selection_asks_in_app(&manual));
        let CodingAgent::ClaudeCode(ClaudeCode { approvals, .. }) =
            coding_agent_from_selection(&manual).unwrap()
        else {
            panic!("expected claude");
        };
        assert_eq!(approvals, Some(true));
    }

    #[test]
    fn an_unsupported_permission_falls_back_to_manual() {
        assert_eq!(
            adjust_permission(BaseCodingAgent::Gemini, PermissionLevel::Plan),
            PermissionLevel::Manual
        );
        assert!(
            !supported_permissions(BaseCodingAgent::CursorAgent).contains(&PermissionLevel::Auto)
        );
        let agent =
            coding_agent_from_selection(&selection(BaseCodingAgent::Gemini, PermissionLevel::Plan))
                .unwrap();
        let CodingAgent::Gemini(Gemini { yolo, .. }) = agent else {
            panic!("expected gemini");
        };
        assert_eq!(yolo, Some(false));
    }

    #[test]
    fn pinned_model_is_copied_onto_the_agent() {
        let mut picked = selection(BaseCodingAgent::CursorAgent, PermissionLevel::Bypass);
        picked.model = Some("composer-2.5".to_string());
        let CodingAgent::CursorAgent(CursorAgent { model, force, .. }) =
            coding_agent_from_selection(&picked).unwrap()
        else {
            panic!("expected cursor");
        };
        assert_eq!(model.as_deref(), Some("composer-2.5"));
        assert_eq!(force, Some(true));
    }

    #[test]
    fn other_agents_map_the_modes_they_offer() {
        let CodingAgent::Droid(Droid { autonomy, .. }) = coding_agent_from_selection(&selection(
            BaseCodingAgent::Droid,
            PermissionLevel::AcceptEdits,
        ))
        .unwrap() else {
            panic!("expected droid");
        };
        assert_eq!(autonomy, crate::executors::droid::Autonomy::Medium);

        let CodingAgent::Opencode(Opencode {
            agent,
            auto_approve,
            ..
        }) = coding_agent_from_selection(&selection(
            BaseCodingAgent::Opencode,
            PermissionLevel::Plan,
        ))
        .unwrap()
        else {
            panic!("expected opencode");
        };
        assert_eq!(agent.as_deref(), Some("plan"));
        assert!(auto_approve);

        let CodingAgent::Amp(Amp {
            dangerously_allow_all,
            ..
        }) = coding_agent_from_selection(&selection(BaseCodingAgent::Amp, PermissionLevel::Bypass))
            .unwrap()
        else {
            panic!("expected amp");
        };
        assert_eq!(dangerously_allow_all, Some(true));

        let CodingAgent::Copilot(Copilot {
            allow_all_tools, ..
        }) = coding_agent_from_selection(&selection(
            BaseCodingAgent::Copilot,
            PermissionLevel::Bypass,
        ))
        .unwrap()
        else {
            panic!("expected copilot");
        };
        assert_eq!(allow_all_tools, Some(true));

        let CodingAgent::QwenCode(QwenCode { yolo, .. }) = coding_agent_from_selection(&selection(
            BaseCodingAgent::QwenCode,
            PermissionLevel::Manual,
        ))
        .unwrap() else {
            panic!("expected qwen");
        };
        assert_eq!(yolo, Some(false));
    }

    #[test]
    fn legacy_profiles_keep_a_pinned_model_and_map_plan_and_approvals() {
        let profiles = serde_json::json!({
            "executors": {
                "CLAUDE_CODE": {
                    "DEFAULT": { "CLAUDE_CODE": { "dangerously_skip_permissions": true } },
                    "PLAN": { "CLAUDE_CODE": { "plan": true } },
                    "FABLE_5_1": { "CLAUDE_CODE": { "dangerously_skip_permissions": true, "model": "claude-fable-5-1" } }
                },
                "GEMINI": {
                    "APPROVALS": { "GEMINI": { "yolo": false } }
                }
            }
        });
        let pinned = selection_from_legacy(
            BaseCodingAgent::ClaudeCode,
            Some("FABLE_5_1"),
            Some(&profiles),
        );
        assert_eq!(pinned.model.as_deref(), Some("claude-fable-5-1"));
        assert_eq!(pinned.permission, PermissionLevel::Bypass);

        let plan =
            selection_from_legacy(BaseCodingAgent::ClaudeCode, Some("PLAN"), Some(&profiles));
        assert_eq!(plan.permission, PermissionLevel::Plan);
        assert!(plan.model.is_none());

        let approvals =
            selection_from_legacy(BaseCodingAgent::Gemini, Some("APPROVALS"), Some(&profiles));
        assert_eq!(approvals.permission, PermissionLevel::Manual);
    }

    #[test]
    fn a_missing_profile_file_uses_the_variant_name() {
        let plan = selection_from_legacy(BaseCodingAgent::ClaudeCode, Some("PLAN"), None);
        assert_eq!(plan.permission, PermissionLevel::Plan);
        assert!(plan.model.is_none());

        let approvals = selection_from_legacy(BaseCodingAgent::ClaudeCode, Some("APPROVALS"), None);
        assert_eq!(approvals.permission, PermissionLevel::Manual);

        let other = selection_from_legacy(BaseCodingAgent::ClaudeCode, Some("FABLE_5_1"), None);
        assert_eq!(other.permission, PermissionLevel::Bypass);
        assert!(other.model.is_none());
    }
}
