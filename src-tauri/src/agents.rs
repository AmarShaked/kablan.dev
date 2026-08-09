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

/// Read-only tools NOT gated behind the human approval flow (mirrors vibe-kanban's
/// allowlist, tied to @anthropic-ai/claude-code's control protocol). Every OTHER tool
/// matches this negative-lookahead regex and routes to the "tool_approval" callback.
const SUPERVISED_PRETOOL_MATCHER: &str = "^(?!(Glob|Grep|NotebookRead|Read|Task|TodoWrite)$).*";

/// Callback id our PreToolUse hooks route to; the CLI echoes it back on hook_callback.
const TOOL_APPROVAL_CALLBACK_ID: &str = "tool_approval";

/// Canonical denial-message prefix, byte-for-byte matching the Claude Code CLI (copied
/// from vibe-kanban's client.rs). The user's reason is appended after it.
const TOOL_DENY_PREFIX: &str = "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). To tell you how to proceed, the user said: ";

/// A tool call awaiting the human Approve/Deny gate. Maps a generated `approval_id`
/// (the ws/HTTP handle) back to the CLI's original control_request `request_id` so the
/// control_response we eventually write is correlated by the CLI.
#[derive(Clone)]
struct PendingApproval {
    /// The CLI's `can_use_tool` control_request `request_id` we must echo back.
    request_id: String,
    tool_name: String,
    input: Value,
    created_at: i64,
}

/// The wire shape of a pending approval, shared by the `agent-approval` ws frame and the
/// `get_branch_agent` backfill: `{ id, toolName, input, createdAt }`.
fn approval_view(id: &str, tool_name: &str, input: &Value, created_at: i64) -> Value {
    json!({ "id": id, "toolName": tool_name, "input": input, "createdAt": created_at })
}

/// PreToolUse hooks for supervised mode: gate every non-read-only tool through the
/// "tool_approval" callback (which returns "ask", making the CLI emit the real
/// `can_use_tool` request). Carried in the post-spawn `initialize` handshake.
pub fn supervised_hooks() -> Value {
    json!({
        "PreToolUse": [
            { "matcher": SUPERVISED_PRETOOL_MATCHER, "hookCallbackIds": [TOOL_APPROVAL_CALLBACK_ID] }
        ]
    })
}

/// `initialize` control_request (SDK → CLI): registers the PreToolUse hooks.
pub fn build_initialize_request(request_id: &str, hooks: Value) -> Value {
    json!({
        "type": "control_request",
        "request_id": request_id,
        "request": { "subtype": "initialize", "hooks": hooks },
    })
}

/// `set_permission_mode` control_request (SDK → CLI). We send "default" after launching the
/// CLI in bypassPermissions, so it stops auto-prompting and defers to our hooks instead.
pub fn build_set_permission_mode_request(request_id: &str, mode: &str) -> Value {
    json!({
        "type": "control_request",
        "request_id": request_id,
        "request": { "subtype": "set_permission_mode", "mode": mode },
    })
}

/// control_response to a `hook_callback` (SDK → CLI): return "ask", which makes the CLI
/// follow up with the real `can_use_tool` control_request — the human gate.
pub fn build_hook_ask_response(orig_request_id: &str) -> Value {
    json!({
        "type": "control_response",
        "response": {
            "subtype": "success",
            "request_id": orig_request_id,
            "response": {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "ask",
                    "permissionDecisionReason": "Forwarding to canusetool service"
                }
            }
        }
    })
}

/// control_response allowing a `can_use_tool` request, echoing the original input unchanged.
pub fn build_allow_response(orig_request_id: &str, input: &Value) -> Value {
    json!({
        "type": "control_response",
        "response": {
            "subtype": "success",
            "request_id": orig_request_id,
            "response": { "behavior": "allow", "updatedInput": input }
        }
    })
}

/// control_response denying a `can_use_tool` request. `reason` is the user's note, appended
/// to the canonical CLI denial prefix. `interrupt: false` lets the turn continue.
pub fn build_deny_response(orig_request_id: &str, reason: &str) -> Value {
    json!({
        "type": "control_response",
        "response": {
            "subtype": "success",
            "request_id": orig_request_id,
            "response": {
                "behavior": "deny",
                "message": format!("{TOOL_DENY_PREFIX}{reason}"),
                "interrupt": false
            }
        }
    })
}

/// Parse a `can_use_tool` control_request into `(orig_request_id, tool_name, input)`.
/// Returns None for any other message shape.
pub fn parse_can_use_tool(raw: &Value) -> Option<(String, String, Value)> {
    let request = raw.get("request")?;
    if request.get("subtype")?.as_str()? != "can_use_tool" {
        return None;
    }
    let request_id = raw.get("request_id")?.as_str()?.to_string();
    let tool_name = request.get("tool_name")?.as_str()?.to_string();
    let input = request.get("input").cloned().unwrap_or(Value::Null);
    Some((request_id, tool_name, input))
}

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
    /// Tool calls awaiting the human Approve/Deny gate (supervised mode), keyed by approval_id.
    pending: HashMap<String, PendingApproval>,
}

pub struct Agents {
    registry: Mutex<HashMap<String, AgentRecord>>,
    tx: broadcast::Sender<String>,
    gen: AtomicU64,
    /// Monotonic source for control_request `request_id`s (handshake).
    req_seq: AtomicU64,
    /// Monotonic source for `approval_id`s (the human-gate handle).
    approval_seq: AtomicU64,
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

/// Build the argv (program + flags) for launching an owned agent process.
/// Pure and unit-tested: verifies the spike-confirmed flag set.
///
/// `resume` resumes a persisted Claude session (`--resume <session_id>`). `resume_at`, only
/// meaningful alongside `resume`, forks that session AT a specific message uuid
/// (`--resume-session-at <uuid>`): Claude truncates its conversation history to that message
/// (inclusive) and continues from there. We fork at the FINAL assistant-message uuid of the turn
/// preceding the edited/retried user turn, then re-send the (edited) text — so the earlier context
/// is kept, the replaced turn and everything after it is dropped, and the session id is unchanged
/// (no `--fork-session`). This is the message EDIT / RETRY mechanism; verified end-to-end against
/// the Claude Code CLI (2.1.x). Mirrors vibe-kanban's `spawn_follow_up`.
pub fn build_agent_argv(
    cfg: &crate::config::FactorySettings,
    resume: Option<&str>,
    resume_at: Option<&str>,
) -> Vec<String> {
    let supervised = cfg.permission_mode == "supervised";
    let mut a: Vec<String> = vec![
        cfg.agent_command.clone(),
        "--print".into(), "--verbose".into(),
        "--output-format".into(), "stream-json".into(),
        "--input-format".into(), "stream-json".into(),
        "--include-partial-messages".into(),
    ];
    if supervised {
        // Supervised: per-tool Approve/Deny over the stdio control protocol. We launch the CLI
        // in bypassPermissions (so its own prompt flow never stalls a tool call) and route the
        // approval decision entirely through the PreToolUse hooks + can_use_tool handshake that
        // `start()` sends after spawn. `--replay-user-messages` mirrors vibe-kanban.
        a.push("--permission-prompt-tool".into()); a.push("stdio".into());
        a.push("--permission-mode".into()); a.push("bypassPermissions".into());
        a.push("--replay-user-messages".into());
    } else {
        a.push("--permission-mode".into()); a.push(cfg.permission_mode.clone());
    }
    // An explicit MCP config file loads its servers' tools into the spawned CLI (they still get
    // gated by our supervised Approve/Deny flow). Applies regardless of permission mode.
    if !cfg.mcp_config_path.trim().is_empty() {
        a.push("--mcp-config".into());
        a.push(cfg.mcp_config_path.trim().to_string());
    }
    if !cfg.agent_model.trim().is_empty() { a.push("--model".into()); a.push(cfg.agent_model.clone()); }
    if let Some(sid) = resume {
        a.push("--resume".into());
        a.push(sid.to_string());
        // `--resume-session-at` only applies when resuming an existing session (it forks THAT
        // session's history at a message uuid). Without `--resume` it is meaningless, so it's
        // nested here on purpose.
        if let Some(uuid) = resume_at {
            a.push("--resume-session-at".into());
            a.push(uuid.to_string());
        }
    }
    a
}

impl Agents {
    pub fn new() -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(4096);
        Arc::new(Agents {
            registry: Mutex::new(HashMap::new()),
            tx,
            gen: AtomicU64::new(0),
            req_seq: AtomicU64::new(0),
            approval_seq: AtomicU64::new(0),
        })
    }
    fn next_req_id(&self) -> String { format!("req-{}", self.req_seq.fetch_add(1, Ordering::SeqCst) + 1) }
    fn next_approval_id(&self) -> String { format!("appr-{}", self.approval_seq.fetch_add(1, Ordering::SeqCst) + 1) }
    pub fn subscribe(&self) -> broadcast::Receiver<String> { self.tx.subscribe() }
    pub fn get(&self, key: &str) -> Option<AgentView> { self.registry.lock().unwrap().get(key).map(|r| r.view.clone()) }
    pub fn get_all(&self) -> Vec<AgentView> { self.registry.lock().unwrap().values().map(|r| r.view.clone()).collect() }
    pub fn events(&self, key: &str) -> Vec<Value> { self.registry.lock().unwrap().get(key).map(|r| r.events.clone()).unwrap_or_default() }
    /// Snapshot of the key's pending approvals (oldest first), each in the ws-frame `approval`
    /// shape, so a reconnecting client can re-render the outstanding gates.
    pub fn pending_approvals(&self, key: &str) -> Vec<Value> {
        let reg = self.registry.lock().unwrap();
        let Some(r) = reg.get(key) else { return vec![] };
        let mut items: Vec<(&String, &PendingApproval)> = r.pending.iter().collect();
        items.sort_by_key(|(_, p)| p.created_at);
        items.into_iter().map(|(id, p)| approval_view(id, &p.tool_name, &p.input, p.created_at)).collect()
    }
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
        self.registry.lock().unwrap().insert(key.into(), AgentRecord { view, events: vec![], stdin: Arc::new(Mutex::new(None)), generation, pending: HashMap::new() });

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

        // Supervised handshake: if launched with the stdio permission-prompt tool, complete the
        // control-protocol handshake on stdin BEFORE any user message — (a) `initialize` carrying
        // the PreToolUse hooks that gate non-read-only tools, then (b) `set_permission_mode`
        // "default" (we started in bypassPermissions only to silence the CLI's own prompts).
        // Detected from argv so start()'s signature is unchanged. These writes go to the record's
        // stdin we just installed above.
        if argv.iter().any(|a| a == "--permission-prompt-tool") {
            let init = build_initialize_request(&self.next_req_id(), supervised_hooks());
            self.write_stdin_value(key, &init);
            let spm = build_set_permission_mode_request(&self.next_req_id(), "default");
            self.write_stdin_value(key, &spm);
        }

        if let Some(out) = child.stdout.take() {
            let me = Arc::clone(self); let k = key.to_string();
            std::thread::spawn(move || {
                let rdr = BufReader::new(out);
                for line in rdr.lines().map_while(Result::ok) {
                    let raw: Value = serde_json::from_str(&line).unwrap_or(Value::Null);
                    let msg_type = raw.get("type").and_then(|s| s.as_str()).unwrap_or("");

                    // Control-protocol frames (supervised mode) are never surfaced as agent-events.
                    if msg_type == "control_response" {
                        // The CLI's ack of OUR initialize/set_permission_mode requests — consume silently.
                        continue;
                    }
                    if msg_type == "control_request" {
                        // Generation guard: a newer start() on this key owns the current stdin now, so
                        // this dying process must not drive an approval on the new agent's pipe.
                        {
                            let reg = me.registry.lock().unwrap();
                            match reg.get(&k) {
                                Some(r) if r.generation == generation => {}
                                _ => break,
                            }
                        }
                        me.handle_incoming_control(&k, &raw);
                        continue;
                    }

                    let Some(ev) = parse_event(&line) else { continue };
                    let mut status_changed = false;
                    // Set when this event carries the first session id we've seen for
                    // this agent, so we can persist it below (off the registry lock).
                    let mut new_session_id: Option<String> = None;
                    {
                        let mut reg = me.registry.lock().unwrap();
                        if let Some(r) = reg.get_mut(&k) {
                            // A newer `start()` on the same key already replaced this
                            // record (fresh generation). This thread belongs to the
                            // dying process — stop touching the registry so its
                            // trailing output can't clobber the new agent's state
                            // (e.g. stamping a stale session_id).
                            if r.generation != generation { break; }
                            if let Some(sid) = &ev.session_id {
                                if r.view.session_id.is_none() {
                                    r.view.session_id = Some(sid.clone());
                                    new_session_id = Some(sid.clone());
                                }
                            }
                            let next = next_status(r.view.status, &ev);
                            if next != r.view.status { r.view.status = next; status_changed = true; }
                            r.events.push(raw.clone());
                            if r.events.len() > MAX_EVENTS { let ex = r.events.len() - MAX_EVENTS; r.events.drain(0..ex); }
                        } else { break; }
                    }
                    // Persist to disk off the registry lock (best-effort; never
                    // panics/propagates). Same `raw` value that went into the
                    // in-memory `record.events` above — real agent stream events
                    // only, never the synthetic status frames.
                    crate::chat_history::append_event(&k, &raw);
                    // Persist the session id the moment we first learn it, so a
                    // never-polled live session can still `--resume` after restart.
                    if let Some(sid) = &new_session_id {
                        crate::persist_branch_session_id(&k, sid);
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

    /// Send a user turn to the agent over stdin as a stream-json message. `images` are
    /// `(media_type, base64_data)` pairs rendered as Anthropic image content blocks before the
    /// text — so pasted images reach the model natively (multimodal), no temp files. A turn with
    /// only images (empty text) is allowed.
    pub fn send(&self, key: &str, text: &str, images: &[(String, String)]) -> bool {
        let mut content: Vec<Value> = images
            .iter()
            .map(|(media_type, data)| {
                json!({ "type": "image", "source": { "type": "base64", "media_type": media_type, "data": data } })
            })
            .collect();
        if !text.is_empty() {
            content.push(json!({ "type": "text", "text": text }));
        }
        let msg = json!({ "type":"user","message":{ "role":"user","content": content } }).to_string();
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

    /// Write a JSON control frame to the agent's stdin, following `send`'s locking discipline:
    /// clone the per-agent stdin Arc under a brief registry lock, then drop it before the blocking
    /// IO. Returns whether the write+flush succeeded.
    fn write_stdin_value(&self, key: &str, v: &Value) -> bool {
        let stdin_arc = {
            let reg = self.registry.lock().unwrap();
            let Some(r) = reg.get(key) else { return false };
            Arc::clone(&r.stdin)
        };
        let line = v.to_string();
        let mut guard = stdin_arc.lock().unwrap();
        match guard.as_mut() {
            Some(stdin) => writeln!(stdin, "{line}").is_ok() && stdin.flush().is_ok(),
            None => false,
        }
    }

    /// Handle an incoming `control_request` from the CLI (supervised mode). Never blocks the reader:
    /// - `hook_callback` (callback_id "tool_approval") → immediately reply "ask", which makes the
    ///   CLI emit the real `can_use_tool` request.
    /// - `can_use_tool` → THE HUMAN GATE: store a PendingApproval and broadcast an `agent-approval`
    ///   frame. The CLI naturally waits for our control_response (written later by resolve_approval).
    fn handle_incoming_control(&self, key: &str, raw: &Value) {
        let subtype = raw.get("request").and_then(|r| r.get("subtype")).and_then(|s| s.as_str()).unwrap_or("");
        match subtype {
            "hook_callback" => {
                let callback_id = raw
                    .get("request")
                    .and_then(|r| r.get("callback_id"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("");
                if callback_id == TOOL_APPROVAL_CALLBACK_ID {
                    let orig = raw.get("request_id").and_then(|s| s.as_str()).unwrap_or("");
                    let resp = build_hook_ask_response(orig);
                    self.write_stdin_value(key, &resp);
                }
            }
            "can_use_tool" => {
                let Some((request_id, tool_name, input)) = parse_can_use_tool(raw) else { return };
                let approval_id = self.next_approval_id();
                let created_at = now_ms();
                {
                    let mut reg = self.registry.lock().unwrap();
                    let Some(r) = reg.get_mut(key) else { return };
                    r.pending.insert(
                        approval_id.clone(),
                        PendingApproval { request_id, tool_name: tool_name.clone(), input: input.clone(), created_at },
                    );
                }
                let _ = self.tx.send(json!({
                    "type": "agent-approval",
                    "key": key,
                    "approval": approval_view(&approval_id, &tool_name, &input, created_at),
                }).to_string());
            }
            _ => {}
        }
    }

    /// Resolve a pending approval: write the correlated `control_response` to the agent's stdin
    /// (allow → echo original input; deny → canonical denial message + the user's `reason`), remove
    /// it from pending, and broadcast `agent-approval-resolved`. Returns false if the approval_id
    /// was unknown for the key; otherwise the result of the stdin write.
    pub fn resolve_approval(&self, key: &str, approval_id: &str, decision: &str, reason: Option<&str>) -> bool {
        let pending = {
            let mut reg = self.registry.lock().unwrap();
            let Some(r) = reg.get_mut(key) else { return false };
            match r.pending.remove(approval_id) {
                Some(p) => p,
                None => return false,
            }
        };
        let deny = decision == "deny";
        let response = if deny {
            build_deny_response(&pending.request_id, reason.unwrap_or(""))
        } else {
            build_allow_response(&pending.request_id, &pending.input)
        };
        let ok = self.write_stdin_value(key, &response);
        let _ = self.tx.send(json!({
            "type": "agent-approval-resolved",
            "key": key,
            "approvalId": approval_id,
            "decision": if deny { "deny" } else { "allow" },
        }).to_string());
        ok
    }

    /// Rekey a live agent record from `old_key` to `new_key` — used after the
    /// factory reconciles a session whose worktree was checked out onto a new
    /// branch (see `factory::reconcile_project_worktrees`), so the real branch's
    /// cockpit finds the still-running process instead of a dead row.
    ///
    /// Moves the record only when one exists under `old_key` and NONE exists under
    /// `new_key` — a record already living on `new_key` is a distinct live agent we
    /// must never clobber (returns false). On a successful move it broadcasts a
    /// status frame for `new_key` (so its cockpit picks up pid/status/session) and
    /// one for `old_key` (whose record is now gone, so `get` returns None and the
    /// frame carries a null agent — stale UIs drop the old row). Returns whether it
    /// moved. Broadcasts happen off the registry lock (matches `emit_status`).
    pub fn rekey(&self, old_key: &str, new_key: &str) -> bool {
        if old_key == new_key {
            return false;
        }
        {
            let mut reg = self.registry.lock().unwrap();
            if reg.contains_key(new_key) {
                return false; // never clobber a live agent already on new_key
            }
            let Some(mut rec) = reg.remove(old_key) else { return false };
            rec.view.key = new_key.to_string();
            reg.insert(new_key.to_string(), rec);
        }
        self.emit_status(new_key);
        // old_key's record is gone now → get() is None → this frame's agent is null.
        self.emit_status(old_key);
        true
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

    fn has_pair(argv: &[String], flag: &str, val: &str) -> bool {
        argv.windows(2).any(|w| w[0] == flag && w[1] == val)
    }

    #[test]
    fn build_argv_supervised_uses_prompt_tool_and_bypass() {
        let mut cfg = crate::config::FactorySettings::default();
        cfg.agent_command = "claude".into();
        cfg.permission_mode = "supervised".into();
        let argv = build_agent_argv(&cfg, None, None);
        // Supervised launches with the stdio prompt tool + bypassPermissions (NOT "supervised"),
        // and replays user messages.
        assert!(has_pair(&argv, "--permission-prompt-tool", "stdio"), "{argv:?}");
        assert!(has_pair(&argv, "--permission-mode", "bypassPermissions"), "{argv:?}");
        assert!(argv.iter().any(|a| a == "--replay-user-messages"), "{argv:?}");
        assert!(!argv.iter().any(|a| a == "supervised"), "must not pass raw supervised: {argv:?}");
    }

    #[test]
    fn build_argv_non_supervised_unchanged() {
        let mut cfg = crate::config::FactorySettings::default();
        cfg.agent_command = "claude".into();
        cfg.permission_mode = "acceptEdits".into();
        let argv = build_agent_argv(&cfg, None, None);
        assert!(has_pair(&argv, "--permission-mode", "acceptEdits"), "{argv:?}");
        assert!(!argv.iter().any(|a| a == "--permission-prompt-tool"), "{argv:?}");
        assert!(!argv.iter().any(|a| a == "--replay-user-messages"), "{argv:?}");
    }

    #[test]
    fn build_argv_appends_mcp_config_when_set() {
        // Set: the flag+path pair is appended (normal, non-supervised branch).
        let mut cfg = crate::config::FactorySettings::default();
        cfg.agent_command = "claude".into();
        cfg.permission_mode = "acceptEdits".into();
        cfg.mcp_config_path = "/some/path".into();
        let argv = build_agent_argv(&cfg, None, None);
        assert!(has_pair(&argv, "--mcp-config", "/some/path"), "{argv:?}");

        // Empty (default): no --mcp-config flag at all.
        let mut empty = crate::config::FactorySettings::default();
        empty.agent_command = "claude".into();
        empty.permission_mode = "acceptEdits".into();
        let argv2 = build_agent_argv(&empty, None, None);
        assert!(!argv2.iter().any(|a| a == "--mcp-config"), "{argv2:?}");
    }

    #[test]
    fn build_argv_appends_mcp_config_in_supervised_branch() {
        // The mcp flag applies regardless of permission mode — supervised included.
        let mut cfg = crate::config::FactorySettings::default();
        cfg.agent_command = "claude".into();
        cfg.permission_mode = "supervised".into();
        cfg.mcp_config_path = "  /trim/me.json  ".into();
        let argv = build_agent_argv(&cfg, None, None);
        // Trimmed before it hits the argv.
        assert!(has_pair(&argv, "--mcp-config", "/trim/me.json"), "{argv:?}");
        // Supervised handshake flags still present.
        assert!(has_pair(&argv, "--permission-prompt-tool", "stdio"), "{argv:?}");
    }

    #[test]
    fn can_use_tool_parses_to_pending_and_builds_control_responses() {
        // A can_use_tool control_request as the CLI would emit it.
        let raw: Value = serde_json::from_str(
            r#"{"type":"control_request","request_id":"req-cli-7","request":{"subtype":"can_use_tool","tool_name":"Bash","input":{"command":"ls -la"},"tool_use_id":"toolu_1"}}"#,
        ).unwrap();
        let (request_id, tool_name, input) = parse_can_use_tool(&raw).unwrap();
        assert_eq!(request_id, "req-cli-7");
        assert_eq!(tool_name, "Bash");
        assert_eq!(input, json!({"command":"ls -la"}));

        // Allow: echoes the original input as updatedInput, keyed by the original request_id.
        let allow = build_allow_response(&request_id, &input);
        assert_eq!(allow["type"], "control_response");
        assert_eq!(allow["response"]["subtype"], "success");
        assert_eq!(allow["response"]["request_id"], "req-cli-7");
        assert_eq!(allow["response"]["response"]["behavior"], "allow");
        assert_eq!(allow["response"]["response"]["updatedInput"], json!({"command":"ls -la"}));

        // Deny: canonical prefix + reason, interrupt false.
        let deny = build_deny_response(&request_id, "not right now");
        assert_eq!(deny["response"]["subtype"], "success");
        assert_eq!(deny["response"]["request_id"], "req-cli-7");
        assert_eq!(deny["response"]["response"]["behavior"], "deny");
        assert_eq!(deny["response"]["response"]["interrupt"], false);
        let msg = deny["response"]["response"]["message"].as_str().unwrap();
        assert!(msg.starts_with("The user doesn't want to proceed with this tool use."), "{msg}");
        assert!(msg.ends_with("not right now"), "{msg}");
    }

    #[test]
    fn hook_callback_produces_ask_control_response() {
        let ask = build_hook_ask_response("req-cli-42");
        assert_eq!(ask["type"], "control_response");
        assert_eq!(ask["response"]["subtype"], "success");
        assert_eq!(ask["response"]["request_id"], "req-cli-42");
        let hso = &ask["response"]["response"]["hookSpecificOutput"];
        assert_eq!(hso["hookEventName"], "PreToolUse");
        assert_eq!(hso["permissionDecision"], "ask");
    }

    #[test]
    fn initialize_and_set_permission_mode_shapes() {
        let init = build_initialize_request("req-1", supervised_hooks());
        assert_eq!(init["type"], "control_request");
        assert_eq!(init["request_id"], "req-1");
        assert_eq!(init["request"]["subtype"], "initialize");
        let hook = &init["request"]["hooks"]["PreToolUse"][0];
        let matcher = hook["matcher"].as_str().unwrap();
        // Read-only allowlist is NOT gated; everything else routes to tool_approval.
        assert!(matcher.contains("Glob|Grep|NotebookRead|Read|Task|TodoWrite"), "{matcher}");
        assert_eq!(hook["hookCallbackIds"][0], "tool_approval");

        let spm = build_set_permission_mode_request("req-2", "default");
        assert_eq!(spm["request"]["subtype"], "set_permission_mode");
        assert_eq!(spm["request"]["mode"], "default");
    }

    #[test]
    fn parse_can_use_tool_rejects_other_frames() {
        let hook: Value = serde_json::from_str(
            r#"{"type":"control_request","request_id":"r","request":{"subtype":"hook_callback","callback_id":"tool_approval","input":{}}}"#,
        ).unwrap();
        assert!(parse_can_use_tool(&hook).is_none());
    }

    #[test]
    fn resolve_approval_unknown_key_is_false() {
        let agents = Agents::new();
        assert!(!agents.resolve_approval("no::such", "appr-1", "allow", None));
        assert!(agents.pending_approvals("no::such").is_empty());
    }

    #[test]
    fn build_argv_has_verified_flags() {
        let mut cfg = crate::config::FactorySettings::default();
        cfg.agent_command = "claude".into();
        cfg.permission_mode = "acceptEdits".into();
        cfg.agent_model = "opus".into();
        let argv = build_agent_argv(&cfg, Some("sid-9"), None);
        assert_eq!(argv[0], "claude");
        for f in ["--print","--output-format","stream-json","--input-format","--permission-mode","acceptEdits","--model","opus","--resume","sid-9"] {
            assert!(argv.iter().any(|a| a == f), "missing {f} in {argv:?}");
        }
        // No fork requested → no --resume-session-at flag.
        assert!(!argv.iter().any(|a| a == "--resume-session-at"), "{argv:?}");
    }

    #[test]
    fn build_argv_resume_at_adds_fork_flag() {
        let mut cfg = crate::config::FactorySettings::default();
        cfg.agent_command = "claude".into();
        cfg.permission_mode = "acceptEdits".into();
        // Forking a resumed session: both --resume <sid> and --resume-session-at <uuid> are present,
        // and the fork uuid immediately follows the flag (order matters for the CLI).
        let argv = build_agent_argv(&cfg, Some("sid-9"), Some("uuid-abc"));
        assert!(has_pair(&argv, "--resume", "sid-9"), "{argv:?}");
        assert!(has_pair(&argv, "--resume-session-at", "uuid-abc"), "{argv:?}");

        // resume_at is ignored without a session to resume (it's meaningless on its own).
        let fresh = build_agent_argv(&cfg, None, Some("uuid-abc"));
        assert!(!fresh.iter().any(|a| a == "--resume-session-at"), "{fresh:?}");
        assert!(!fresh.iter().any(|a| a == "--resume"), "{fresh:?}");
    }

    #[test]
    fn supervisor_starts_streams_and_captures_session() {
        let agents = Agents::new();
        let cwd = std::env::temp_dir();
        agents.start("p::tf1", &cwd.to_string_lossy(), mock_argv(), None);
        agents.send("p::tf1", "hello", &[]);
        assert!(wait_until(|| agents.get("p::tf1").and_then(|v| v.session_id).is_some()));
        assert!(wait_until(|| matches!(agents.get("p::tf1").map(|v| v.status), Some(AgentStatus::AwaitingInput))));
        let evs = agents.events("p::tf1");
        assert!(evs.iter().any(|e| e["type"] == "assistant"));
    }

    #[test]
    fn supervisor_marks_failed_on_error_result() {
        let agents = Agents::new();
        agents.start("p::tf2", &std::env::temp_dir().to_string_lossy(), mock_argv(), None);
        agents.send("p::tf2", "please FAILME", &[]);
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
    fn rekey_moves_record_and_guards_against_clobber() {
        let agents = Agents::new();
        let cwd = std::env::temp_dir().to_string_lossy().to_string();

        // A live agent under the old (session) key.
        agents.start("p::branch:session/x", &cwd, mock_argv(), None);
        assert!(wait_until(|| agents.get("p::branch:session/x").is_some()));

        // Rekey onto a fresh key: the record moves and the old key is emptied.
        assert!(agents.rekey("p::branch:session/x", "p::branch:feat/real"));
        assert!(agents.get("p::branch:session/x").is_none(), "old key removed");
        let moved = agents.get("p::branch:feat/real").expect("record now under new key");
        assert_eq!(moved.key, "p::branch:feat/real", "view.key updated");

        // Unknown old key → no move.
        assert!(!agents.rekey("p::branch:missing", "p::branch:whatever"));
        // Same key → no move.
        assert!(!agents.rekey("p::branch:feat/real", "p::branch:feat/real"));

        // Clobber guard: a second live agent must not be overwritten by a rekey onto its key.
        agents.start("p::branch:other", &cwd, mock_argv(), None);
        assert!(wait_until(|| agents.get("p::branch:other").is_some()));
        assert!(!agents.rekey("p::branch:other", "p::branch:feat/real"), "occupied target not clobbered");
        assert!(agents.get("p::branch:other").is_some(), "source left intact when target occupied");
    }

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
        agents.send(key, "hello", &[]);
        assert!(wait_until(|| agents.get(key).and_then(|v| v.session_id).is_some()));
        assert!(wait_until(|| matches!(agents.get(key).map(|v| v.status), Some(AgentStatus::AwaitingInput))));
    }
}
