//! Owned Claude Code agents per Task Force — mirrors processes.rs, but with
//! piped stdin and stream-json parsing. Permission-mode trust (v1).
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::broadcast;
#[cfg(unix)]
use std::os::unix::process::CommandExt;

const MAX_EVENTS: usize = 5000;

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
/// applied separately: the waiter thread spawned in `Agents::start` blocks on
/// `child.wait()` and, once the process exits, sets the final `Done`/`Failed`
/// status and clears the pid directly on the matching-generation record.
pub fn next_status(prev: AgentStatus, ev: &ParsedEvent) -> AgentStatus {
    match ev.kind {
        EventKind::Result => {
            if ev.is_error { AgentStatus::Failed } else { AgentStatus::AwaitingInput }
        }
        EventKind::PostTurnSummary if ev.needs_action => AgentStatus::AwaitingInput,
        // `init` fires at startup (and on a `--resume` reconnect) — normally the agent is
        // ready/idle, NOT working. Only actual turn output (assistant / tool results) means
        // "working". Guard the resume case: if a turn was already in progress, an init frame
        // shouldn't flicker it back to Idle.
        EventKind::Init => {
            if matches!(prev, AgentStatus::Working) { AgentStatus::Working } else { AgentStatus::Idle }
        }
        EventKind::Assistant | EventKind::ToolResult => AgentStatus::Working,
        EventKind::Other | EventKind::PostTurnSummary => prev,
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentView {
    pub key: String,
    pub status: AgentStatus,
    pub session_id: Option<String>,
    pub pid: Option<i32>,
    pub started_at: i64,
    pub exit_code: Option<i32>,
}

struct AgentRecord {
    view: AgentView,
    events: Vec<Value>,
    stdin: Arc<Mutex<Option<std::process::ChildStdin>>>,
    generation: u64,
}

pub struct Agents {
    registry: Mutex<HashMap<String, AgentRecord>>,
    tx: broadcast::Sender<String>,
    gen: AtomicU64,
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

/// Build the argv (program + flags) for launching an owned agent process.
/// Pure and unit-tested: verifies the spike-confirmed flag set.
pub fn build_agent_argv(cfg: &crate::config::FactorySettings, resume: Option<&str>) -> Vec<String> {
    let mut a: Vec<String> = vec![
        cfg.agent_command.clone(),
        "--print".into(), "--verbose".into(),
        "--output-format".into(), "stream-json".into(),
        "--input-format".into(), "stream-json".into(),
        "--include-partial-messages".into(),
        "--permission-mode".into(), cfg.permission_mode.clone(),
    ];
    if !cfg.agent_model.trim().is_empty() { a.push("--model".into()); a.push(cfg.agent_model.clone()); }
    if let Some(sid) = resume { a.push("--resume".into()); a.push(sid.to_string()); }
    a
}

impl Agents {
    pub fn new() -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(4096);
        Arc::new(Agents { registry: Mutex::new(HashMap::new()), tx, gen: AtomicU64::new(0) })
    }
    pub fn subscribe(&self) -> broadcast::Receiver<String> { self.tx.subscribe() }
    pub fn get(&self, key: &str) -> Option<AgentView> { self.registry.lock().unwrap().get(key).map(|r| r.view.clone()) }
    pub fn get_all(&self) -> Vec<AgentView> { self.registry.lock().unwrap().values().map(|r| r.view.clone()).collect() }
    pub fn events(&self, key: &str) -> Vec<Value> { self.registry.lock().unwrap().get(key).map(|r| r.events.clone()).unwrap_or_default() }
    pub fn running_count(&self) -> usize {
        self.registry.lock().unwrap().values().filter(|r| r.view.pid.is_some()).count()
    }

    fn emit_status(&self, key: &str) {
        let v = self.get(key);
        let _ = self.tx.send(json!({ "type": "agent-status", "key": key, "agent": v }).to_string());
    }

    pub fn start(self: &Arc<Self>, key: &str, cwd: &str, argv: Vec<String>, _resume: Option<&str>) -> AgentView {
        self.stop(key); // one agent per task force
        let generation = self.gen.fetch_add(1, Ordering::SeqCst) + 1;
        // A freshly-spawned agent is idle/ready, waiting for the user's first message — not
        // "working". It flips to Working when a message is sent (see `send`) or real turn output
        // arrives. This prevents the cockpit showing "thinking…" the instant you Start.
        let view = AgentView { key: key.into(), status: AgentStatus::Idle, session_id: None, pid: None, started_at: now_ms(), exit_code: None };
        self.registry.lock().unwrap().insert(key.into(), AgentRecord { view, events: vec![], stdin: Arc::new(Mutex::new(None)), generation });

        let mut cmd = Command::new(&argv[0]);
        cmd.args(&argv[1..]).current_dir(cwd)
            .env("FORCE_COLOR", "0").env("NO_COLOR", "1")
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(unix)] cmd.process_group(0);

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                if let Some(r) = self.registry.lock().unwrap().get_mut(key) { r.view.status = AgentStatus::Failed; }
                let _ = self.tx.send(json!({ "type":"agent-event","key":key,"event":{"type":"system","subtype":"spawn_error","error":e.to_string()}}).to_string());
                self.emit_status(key);
                return self.get(key).unwrap();
            }
        };
        let pid = child.id() as i32;
        let stdin = child.stdin.take();
        {
            let mut reg = self.registry.lock().unwrap();
            if let Some(r) = reg.get_mut(key) { r.view.pid = Some(pid); r.stdin = Arc::new(Mutex::new(stdin)); }
        }
        self.emit_status(key);

        if let Some(out) = child.stdout.take() {
            let me = Arc::clone(self); let k = key.to_string();
            std::thread::spawn(move || {
                let rdr = BufReader::new(out);
                for line in rdr.lines().map_while(Result::ok) {
                    let Some(ev) = parse_event(&line) else { continue };
                    let raw: Value = serde_json::from_str(&line).unwrap_or(Value::Null);
                    let mut status_changed = false;
                    {
                        let mut reg = me.registry.lock().unwrap();
                        if let Some(r) = reg.get_mut(&k) {
                            // A newer `start()` on the same key already replaced this
                            // record (fresh generation). This thread belongs to the
                            // dying process — stop touching the registry so its
                            // trailing output can't clobber the new agent's state
                            // (e.g. stamping a stale session_id).
                            if r.generation != generation { break; }
                            if let Some(sid) = &ev.session_id { if r.view.session_id.is_none() { r.view.session_id = Some(sid.clone()); } }
                            let next = next_status(r.view.status, &ev);
                            if next != r.view.status { r.view.status = next; status_changed = true; }
                            r.events.push(raw.clone());
                            if r.events.len() > MAX_EVENTS { let ex = r.events.len() - MAX_EVENTS; r.events.drain(0..ex); }
                        } else { break; }
                    }
                    let _ = me.tx.send(json!({ "type":"agent-event","key":k,"event":raw }).to_string());
                    if status_changed { me.emit_status(&k); }
                }
            });
        }
        if let Some(err) = child.stderr.take() {
            let me = Arc::clone(self); let k = key.to_string();
            std::thread::spawn(move || {
                let rdr = BufReader::new(err);
                for line in rdr.lines().map_while(Result::ok) {
                    {
                        let reg = me.registry.lock().unwrap();
                        match reg.get(&k) {
                            Some(r) if r.generation == generation => {}
                            // Same reasoning as the stdout reader above: a newer
                            // agent has taken this key, so this dying process's
                            // stderr no longer belongs to it.
                            _ => break,
                        }
                    }
                    let _ = me.tx.send(json!({ "type":"agent-event","key":k,"event":{"type":"system","subtype":"stderr","text":line}}).to_string());
                }
            });
        }

        let me = Arc::clone(self); let k = key.to_string();
        std::thread::spawn(move || {
            let status = child.wait();
            let code = status.as_ref().ok().and_then(|s| s.code());
            let mut fire = false;
            {
                let mut reg = me.registry.lock().unwrap();
                if let Some(r) = reg.get_mut(&k) {
                    if r.generation == generation {
                        r.view.exit_code = code;
                        r.view.pid = None;
                        *r.stdin.lock().unwrap() = None;
                        r.view.status = if code == Some(0) { AgentStatus::Done } else { AgentStatus::Failed };
                        fire = true;
                    }
                }
            }
            if fire { me.emit_status(&k); }
        });

        self.get(key).unwrap()
    }

    pub fn send(&self, key: &str, text: &str) -> bool {
        let msg = json!({ "type":"user","message":{ "role":"user","content":[{"type":"text","text":text}] } }).to_string();
        // Lock the registry only briefly to confirm the agent exists and clone
        // its per-agent stdin handle, then drop the registry lock before doing
        // any blocking IO — the registry must never be held across writeln!/flush.
        let stdin_arc = {
            let reg = self.registry.lock().unwrap();
            let Some(r) = reg.get(key) else { return false };
            Arc::clone(&r.stdin)
        };
        let ok = {
            let mut guard = stdin_arc.lock().unwrap();
            match guard.as_mut() {
                Some(stdin) => writeln!(stdin, "{msg}").is_ok() && stdin.flush().is_ok(),
                None => false,
            }
        };
        if ok {
            if let Some(r) = self.registry.lock().unwrap().get_mut(key) { r.view.status = AgentStatus::Working; }
            self.emit_status(key);
            true
        } else {
            false
        }
    }

    pub fn stop(&self, key: &str) -> bool {
        let pid = { let reg = self.registry.lock().unwrap();
            match reg.get(key) { Some(r) if r.view.pid.is_some() => r.view.pid.unwrap(), _ => return false } };
        crate::processes::kill_group_pub(pid, false);
        std::thread::spawn(move || { std::thread::sleep(std::time::Duration::from_millis(2000)); crate::processes::kill_group_pub(pid, true); });
        true
    }

    pub fn kill_all(&self) {
        let reg = self.registry.lock().unwrap();
        for r in reg.values() { if let Some(pid) = r.view.pid { crate::processes::kill_group_pub(pid, true); } }
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
        s = next_status(s, &init); assert!(matches!(s, AgentStatus::Idle)); // init = ready, not working
        s = next_status(s, &asst); assert!(matches!(s, AgentStatus::Working)); // real turn output
        s = next_status(s, &res_ok); assert!(matches!(s, AgentStatus::AwaitingInput));
        s = next_status(s, &res_err); assert!(matches!(s, AgentStatus::Failed));
    }

    use std::time::Duration;

    fn mock_argv() -> Vec<String> {
        let fixture = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/mock-agent.mjs");
        vec!["node".to_string(), fixture.to_string()]
    }

    fn wait_until<F: Fn() -> bool>(f: F) -> bool {
        for _ in 0..100 { if f() { return true; } std::thread::sleep(Duration::from_millis(50)); }
        false
    }

    #[test]
    fn build_argv_has_verified_flags() {
        let mut cfg = crate::config::FactorySettings::default();
        cfg.agent_command = "claude".into();
        cfg.permission_mode = "acceptEdits".into();
        cfg.agent_model = "opus".into();
        let argv = build_agent_argv(&cfg, Some("sid-9"));
        assert_eq!(argv[0], "claude");
        for f in ["--print","--output-format","stream-json","--input-format","--permission-mode","acceptEdits","--model","opus","--resume","sid-9"] {
            assert!(argv.iter().any(|a| a == f), "missing {f} in {argv:?}");
        }
    }

    #[test]
    fn supervisor_starts_streams_and_captures_session() {
        let agents = Agents::new();
        let cwd = std::env::temp_dir();
        agents.start("p::tf1", &cwd.to_string_lossy(), mock_argv(), None);
        agents.send("p::tf1", "hello");
        assert!(wait_until(|| agents.get("p::tf1").and_then(|v| v.session_id).is_some()));
        assert!(wait_until(|| matches!(agents.get("p::tf1").map(|v| v.status), Some(AgentStatus::AwaitingInput))));
        let evs = agents.events("p::tf1");
        assert!(evs.iter().any(|e| e["type"] == "assistant"));
    }

    #[test]
    fn supervisor_marks_failed_on_error_result() {
        let agents = Agents::new();
        agents.start("p::tf2", &std::env::temp_dir().to_string_lossy(), mock_argv(), None);
        agents.send("p::tf2", "please FAILME");
        assert!(wait_until(|| matches!(agents.get("p::tf2").map(|v| v.status), Some(AgentStatus::Failed))));
    }

    #[test]
    fn supervisor_stop_kills_process() {
        let agents = Agents::new();
        agents.start("p::tf3", &std::env::temp_dir().to_string_lossy(), mock_argv(), None);
        assert!(wait_until(|| agents.get("p::tf3").and_then(|v| v.pid).is_some()));
        assert!(agents.stop("p::tf3"));
        assert!(wait_until(|| matches!(agents.get("p::tf3").map(|v| v.status), Some(AgentStatus::Done) | Some(AgentStatus::Failed))));
    }

    /// Restart smoke test: calling `start` a second time on the SAME key
    /// (simulating a task-force restart) must not leave the new record
    /// stuck because of the old (dying) process's still-running reader
    /// threads. The generation guard added to the stdout/stderr threads
    /// means the first agent's trailing output is dropped once the second
    /// `start()` swaps in a fresh generation, so the second agent is free
    /// to capture its own session id and reach `AwaitingInput` normally.
    #[test]
    fn restart_on_same_key_lets_new_agent_capture_session() {
        let agents = Agents::new();
        let cwd = std::env::temp_dir().to_string_lossy().to_string();
        let key = "p::tf-restart";

        // First agent on this key.
        agents.start(key, &cwd, mock_argv(), None);
        assert!(wait_until(|| agents.get(key).and_then(|v| v.pid).is_some()));

        // Restart: start() again on the SAME key. This stops the first
        // process (whose reader/stderr threads may still be draining
        // trailing output) and installs a brand-new record + generation.
        agents.start(key, &cwd, mock_argv(), None);

        // The new agent should behave like any freshly-started agent:
        // capture its own session id and progress to AwaitingInput after
        // a message — proving the guard doesn't break normal restarts and
        // that the record which ends up populated is the new one.
        agents.send(key, "hello");
        assert!(wait_until(|| agents.get(key).and_then(|v| v.session_id).is_some()));
        assert!(wait_until(|| matches!(agents.get(key).map(|v| v.status), Some(AgentStatus::AwaitingInput))));
    }
}
