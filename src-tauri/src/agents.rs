//! Owned Claude Code agents per Task Force — mirrors processes.rs, but with
//! piped stdin and stream-json parsing. Permission-mode trust (v1).
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentStatus {
    Idle,
    Working,
    AwaitingInput,
    Done,
    Failed,
}

#[derive(Debug, Clone, PartialEq)]
pub enum EventKind {
    Init,
    Assistant,
    ToolResult, // "user" role tool results
    Result,
    PostTurnSummary,
    Other,
}

pub struct ParsedEvent {
    pub kind: EventKind,
    pub session_id: Option<String>,
    pub is_error: bool,
    pub needs_action: bool,
}

pub fn parse_event(line: &str) -> Option<ParsedEvent> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let v: Value = serde_json::from_str(line).ok()?;
    let t = v.get("type")?.as_str()?;
    let st = v.get("subtype").and_then(|s| s.as_str());
    let kind = match (t, st) {
        ("system", Some("init")) => EventKind::Init,
        ("system", Some("post_turn_summary")) => EventKind::PostTurnSummary,
        ("assistant", _) => EventKind::Assistant,
        ("user", _) => EventKind::ToolResult,
        ("result", _) => EventKind::Result,
        _ => EventKind::Other,
    };
    Some(ParsedEvent {
        kind,
        session_id: v.get("session_id").and_then(|s| s.as_str()).map(String::from),
        is_error: v.get("is_error").and_then(|b| b.as_bool()).unwrap_or(false),
        needs_action: v.get("needs_action").and_then(|b| b.as_bool()).unwrap_or(false),
    })
}

/// Fold a parsed event into the running status. Process liveness (exit) is
/// applied separately by the supervisor (see `mark_exit`).
pub fn next_status(prev: AgentStatus, ev: &ParsedEvent) -> AgentStatus {
    match ev.kind {
        EventKind::Result => {
            if ev.is_error { AgentStatus::Failed } else { AgentStatus::AwaitingInput }
        }
        EventKind::PostTurnSummary if ev.needs_action => AgentStatus::AwaitingInput,
        EventKind::Init | EventKind::Assistant | EventKind::ToolResult => AgentStatus::Working,
        EventKind::Other | EventKind::PostTurnSummary => prev,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_init_session_id() {
        let l = r#"{"type":"system","subtype":"init","session_id":"abc-123","model":"m","permissionMode":"acceptEdits"}"#;
        let p = parse_event(l).unwrap();
        assert!(matches!(p.kind, EventKind::Init));
        assert_eq!(p.session_id.as_deref(), Some("abc-123"));
    }

    #[test]
    fn parses_result_error_flag() {
        let ok = parse_event(r#"{"type":"result","subtype":"success","is_error":false,"result":"ok","session_id":"s"}"#).unwrap();
        assert!(matches!(ok.kind, EventKind::Result));
        assert!(!ok.is_error);
        let err = parse_event(r#"{"type":"result","subtype":"error_max_turns","is_error":true,"session_id":"s"}"#).unwrap();
        assert!(err.is_error);
    }

    #[test]
    fn parses_needs_action_summary() {
        let l = r#"{"type":"system","subtype":"post_turn_summary","needs_action":true,"status_category":"awaiting_user"}"#;
        assert!(parse_event(l).unwrap().needs_action);
    }

    #[test]
    fn garbage_is_none() {
        assert!(parse_event("not json").is_none());
        assert!(parse_event("").is_none());
    }

    #[test]
    fn status_fold_working_then_awaiting_then_failed() {
        let init = parse_event(r#"{"type":"system","subtype":"init","session_id":"s"}"#).unwrap();
        let asst = parse_event(r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}"#).unwrap();
        let res_ok = parse_event(r#"{"type":"result","is_error":false,"result":"ok"}"#).unwrap();
        let res_err = parse_event(r#"{"type":"result","is_error":true}"#).unwrap();
        let mut s = AgentStatus::Idle;
        s = next_status(s, &init); assert!(matches!(s, AgentStatus::Working));
        s = next_status(s, &asst); assert!(matches!(s, AgentStatus::Working));
        s = next_status(s, &res_ok); assert!(matches!(s, AgentStatus::AwaitingInput));
        s = next_status(s, &res_err); assert!(matches!(s, AgentStatus::Failed));
    }
}
