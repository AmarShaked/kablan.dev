# Agent Factory — Plan 03: Agent Supervisor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each Task Force a Kablan-owned Claude Code agent: a long-lived headless process the backend spawns in the worktree, streams to the frontend over WebSocket, feeds user messages via stdin, and can stop/resume — with a derived status. Permission handling is **permission-mode trust** (no interactive per-tool approval; see the spike note below).

**Architecture:** New `src-tauri/src/agents.rs`, mirroring the existing `processes.rs` dev-server supervisor: a registry keyed by Task-Force key, a `broadcast::Sender<String>` of pre-serialized WS messages, reader/waiter threads, `kill_all`. Difference from `processes.rs`: **stdin is piped** (to send user messages) and **stdout is parsed as NDJSON `stream-json` events** (relayed + folded into a status). The agent process is long-lived (verified: one process handles many turns over stdin). It's added to `AppState` next to `procs`, subscribed by the same `ws_handler`, and killed on app exit.

**Tech Stack:** Rust (std::process, tokio broadcast, serde_json), Axum WS. Node is used only for the test mock-agent fixture.

## Spike findings (verified against Claude Code 2.1.217 — build to these)

- `stream-json` is NDJSON, each line an object with a `type`: `system` (`subtype` = `init` / `hook_started` / `hook_response` / `post_turn_summary` / `status` / `thinking_tokens`), `stream_event` (partial deltas), `assistant`, `user` (tool results), `rate_limit_event`, `result` (per-turn terminal).
- `init` → `session_id`, `model`, `permissionMode`, `tools`. `result` → `is_error`, `result`, `session_id`, `total_cost_usd`, `permission_denials`. `post_turn_summary` → `needs_action`, `status_category`, `status_detail`.
- The process is **long-lived** with `--input-format stream-json`: it handles multiple `{type:"user",...}` messages over stdin, emitting one `result` per turn. `--resume <session_id>` is only for reattaching after the process is gone.
- **Permission reality:** `--permission-mode manual` is silently coerced to `default` in `--print`; NO `control_request`/`can_use_tool` ever surfaces. True inline approval is impossible via the raw CLI, so v1 uses **permission-mode trust** — launch with the configured `--permission-mode` (default `acceptEdits`). Interactive Approve/Deny is a future Node-SDK-sidecar enhancement, out of scope here.
- Launch command (verified flags): `claude --print --verbose --output-format stream-json --input-format stream-json --include-partial-messages --permission-mode <mode> [--model <m>] [--resume <sid>]`, cwd = the worktree.

## Global Constraints

- **TDD:** failing test first, then minimal code. Pure logic (event parse, status fold, argv build) is unit-tested directly; the process supervisor is tested against a **Node mock-agent fixture** that emits canned `stream-json` and echoes stdin (no real `claude`, no network).
- Mirror `processes.rs` patterns (registry `Mutex<HashMap>`, `broadcast::Sender<String>`, reader/waiter threads, `process_group`, `kill_group`) — do not invent a new concurrency model.
- Desktop-only, Rust-only; additive routes + WS message types; the 75-test parity suite stays green.
- camelCase JSON. Permission-mode trust only (no interactive approval this plan).
- The agent's `session_id` (from `init`) persists onto the Task Force so a later `--resume` can reattach.
- Commit after each task with a `feat(factory):` / `test(factory):` prefix.

## File Structure

- `src-tauri/src/config.rs` — reconcile `permission_mode` default (`acceptEdits`) + `apply_factory_patch` allowlist to the real CLI set.
- `web/api.ts`, `web/components/AgentSettings.tsx` (+ its test) — reconcile the `permissionMode` union + select options.
- `src-tauri/src/agents.rs` — NEW. Event model + status fold, `build_agent_argv`, the `Agents` supervisor, tests.
- `src-tauri/tests/fixtures/mock-agent.mjs` — NEW. Node mock agent for supervisor tests.
- `src-tauri/src/factory.rs` — add `agent_session_id` to `TaskForce`; a setter to persist it.
- `src-tauri/src/lib.rs` — `pub mod agents;`, `AppState.agents`, ws subscribe, endpoints, launch-on-create, stop-on-exit.
- `src-tauri/src/main.rs` — kill agents on `RunEvent::Exit` when `stop_agents_on_exit`.

---

## Task 1: Reconcile permissionMode to the real CLI set

**Files:** `src-tauri/src/config.rs`, `web/api.ts`, `web/components/AgentSettings.tsx`, `web/components/AgentSettings.test.tsx`

**Interfaces:** the valid `permissionMode` values become exactly `["default","acceptEdits","auto","bypassPermissions"]`; the factory default becomes `"acceptEdits"`.

- [ ] **Step 1: Rust — failing test**

In `config.rs` tests module add:

```rust
    #[test]
    fn factory_default_permission_mode_is_accept_edits() {
        assert_eq!(FactorySettings::default().permission_mode, "acceptEdits");
    }

    #[test]
    fn apply_patch_rejects_unknown_permission_mode_and_accepts_auto() {
        let base = AppConfig::default();
        let bad = apply_patch(base.clone(), &serde_json::json!({"factory":{"permissionMode":"plan"}}));
        assert_eq!(bad.factory.permission_mode, "acceptEdits"); // unchanged (rejected)
        let ok = apply_patch(base, &serde_json::json!({"factory":{"permissionMode":"auto"}}));
        assert_eq!(ok.factory.permission_mode, "auto");
    }
```

- [ ] **Step 2: Run → fail.** `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features config::tests` (the two new tests fail).

- [ ] **Step 3: Implement.** In `config.rs`: change `default_permission_mode()` to return `"acceptEdits"`. In `apply_factory_patch`, change the allowlist from `["default","acceptEdits","plan","bypassPermissions"]` to `["default","acceptEdits","auto","bypassPermissions"]`.

- [ ] **Step 4: Run → pass** (all `config::tests`). Then `npm run test:server:rust 2>&1 | tail -4` → `# fail 0`.

- [ ] **Step 5: Frontend.** In `web/api.ts` change the `permissionMode` union to `"default" | "acceptEdits" | "auto" | "bypassPermissions"`. In `AgentSettings.tsx` update the permission-mode `<select>` options to those four (labels: "Ask (default)", "Accept edits", "Auto", "Bypass all"). Update `AgentSettings.test.tsx`'s permission-mode test to select `"auto"` (or another valid value) instead of any removed one. Run `npm run test:web -- AgentSettings` → pass; `npx tsc --noEmit -p .` → clean.

- [ ] **Step 6: Commit** `feat(factory): reconcile permissionMode to the real CLI modes`.

---

## Task 2: Stream-json event model + status fold

**Files:** Create `src-tauri/src/agents.rs`; add `pub mod agents;` to `lib.rs`.

**Interfaces:**
- `pub enum AgentStatus` → serializes to `"idle"|"working"|"awaitingInput"|"done"|"failed"`.
- `pub struct ParsedEvent { pub kind: EventKind, pub session_id: Option<String>, pub is_error: bool, pub needs_action: bool }` where `EventKind` classifies a line.
- `pub fn parse_event(line: &str) -> Option<ParsedEvent>` (None for blank/garbage).
- `pub fn next_status(prev: AgentStatus, ev: &ParsedEvent) -> AgentStatus`.

- [ ] **Step 1: Failing tests** (real captured envelopes):

```rust
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
```

- [ ] **Step 2: Run → fail** (module/types missing).

- [ ] **Step 3: Implement** the top of `agents.rs`:

```rust
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
```

- [ ] **Step 4: Run → pass** (`agents::tests`).
- [ ] **Step 5: Commit** `feat(factory): stream-json event parser + status fold`.

---

## Task 3: The agent supervisor (spawn / stream / send / stop)

**Files:** `src-tauri/src/agents.rs`, `src-tauri/tests/fixtures/mock-agent.mjs`

**Interfaces:**
- `pub fn build_agent_argv(cfg: &crate::config::FactorySettings, resume: Option<&str>) -> Vec<String>` (pure; tested).
- `pub struct Agents` with `pub fn new() -> Arc<Self>`, `subscribe()`, `get(key) -> Option<AgentView>`, `get_all()`, `events(key) -> Vec<Value>`, `start(key, cwd, argv, resume) -> AgentView`, `send(key, text) -> bool`, `stop(key) -> bool`, `kill_all()`, `running_count()`.
- `pub struct AgentView { key, status, session_id, pid, started_at, exit_code }` (camelCase serde).

- [ ] **Step 1: Write the mock agent fixture** `src-tauri/tests/fixtures/mock-agent.mjs`:

```js
// Minimal stream-json mock agent for supervisor tests. Ignores CLI flags.
// Emits one init, then per stdin user-message an assistant + result. A message
// containing "FAILME" yields an error result. "QUIT" ends the process.
import readline from "node:readline";
const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
emit({ type: "system", subtype: "init", session_id: "mock-session-1", model: "mock", permissionMode: "acceptEdits" });
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (l) => {
  let text = "";
  try { text = (JSON.parse(l).message?.content || []).map((b) => b.text || "").join(""); } catch { return; }
  if (text.includes("QUIT")) { process.exit(0); }
  const isErr = text.includes("FAILME");
  emit({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: `echo:${text}` }] }, session_id: "mock-session-1" });
  emit({ type: "result", subtype: isErr ? "error" : "success", is_error: isErr, result: `echo:${text}`, session_id: "mock-session-1" });
});
rl.on("close", () => process.exit(0));
```

- [ ] **Step 2: Failing tests** (append to `agents.rs` tests):

```rust
    use std::sync::Arc;
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
```

- [ ] **Step 3: Run → fail.**

- [ ] **Step 4: Implement** the supervisor in `agents.rs`, mirroring `processes.rs`. Key points: piped stdin stored per record; stdout reader thread parses each line with `parse_event`, pushes the raw `Value` to the record's capped event buffer, folds status, and broadcasts `{"type":"agent-event","key":..,"event":<raw>}` + `{"type":"agent-status","key":..,"agent":<view>}`; a waiter thread sets `Done` (code 0) / `Failed` (non-zero) on exit. Use the full argv (program + args) so tests inject `node mock-agent.mjs`.

```rust
use serde_json::json;
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
    stdin: Option<std::process::ChildStdin>,
    generation: u64,
}

pub struct Agents {
    registry: Mutex<HashMap<String, AgentRecord>>,
    tx: broadcast::Sender<String>,
    gen: AtomicU64,
}

fn now_ms() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64 }

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
        let view = AgentView { key: key.into(), status: AgentStatus::Working, session_id: None, pid: None, started_at: now_ms(), exit_code: None };
        self.registry.lock().unwrap().insert(key.into(), AgentRecord { view, events: vec![], stdin: None, generation });

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
            if let Some(r) = reg.get_mut(key) { r.view.pid = Some(pid); r.stdin = stdin; }
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
                        r.stdin = None;
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
        let mut reg = self.registry.lock().unwrap();
        let Some(r) = reg.get_mut(key) else { return false };
        let Some(stdin) = r.stdin.as_mut() else { return false };
        if writeln!(stdin, "{msg}").is_ok() && stdin.flush().is_ok() {
            r.view.status = AgentStatus::Working;
            drop(reg);
            self.emit_status(key);
            true
        } else { false }
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
```

`stop`/`kill_all` reuse `processes.rs`'s kill logic. In `processes.rs`, add a thin public wrapper (it already has `kill_group`):

```rust
pub fn kill_group_pub(pid: i32, force: bool) { kill_group(pid, force); }
```

- [ ] **Step 5: Run → pass.** `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features agents::tests` (requires `node` on PATH). Then `cargo build --lib --no-default-features` clean.

- [ ] **Step 6: Commit** `feat(factory): owned agent supervisor (spawn/stream/send/stop)`.

---

## Task 4: Integration — AppState, WS, endpoints, session persistence, lifecycle

**Files:** `src-tauri/src/lib.rs`, `src-tauri/src/factory.rs`, `src-tauri/src/main.rs`

- [ ] **Step 1: Persist session id on the Task Force.** In `factory.rs` add to `TaskForce`: `#[serde(skip_serializing_if="Option::is_none", default)] pub agent_session_id: Option<String>`. Add `pub fn set_agent_session(file:&mut FactoryFile, project:&str, tf_id:&str, sid:&str)` that finds the TF across features and sets it. Add a test: set then read back. (`create_task_force` initializes it `None`.)

- [ ] **Step 2: AppState + WS.** In `lib.rs`: `pub mod agents;`; add `pub agents: Arc<agents::Agents>` to `AppState` (construct in the same place `procs` is built). In `ws_handler`, also subscribe `st.agents.subscribe()` and forward its messages to the socket (merge the two broadcast receivers in the existing select loop).

- [ ] **Step 3: Endpoints.** Add routes + thin handlers:
  - `POST /api/projects/:name/factory/taskforces/:tid/agent/start` — resolve project dir; look up the TF in the store to get its `worktree_path` + `agent_session_id`; enforce `config.factory.max_concurrent_agents` (`if agents.running_count() >= max` → 429/`bad("agent limit reached")`); `agents.start(key, worktree_path, build_agent_argv(cfg, session_id.as_deref()), …)`; return the `AgentView`. Key = `format!("{name}::{tid}")`.
  - `POST …/agent/message` `{ text }` → `agents.send(key, text)` → `{ ok }`.
  - `POST …/agent/stop` → `agents.stop(key)` → `{ ok }`.
  - `GET …/agent` → `{ agent: AgentView?, events: Value[] }` (for reconnecting UI).
- [ ] **Step 4: Persist session on init.** After `agents.start`, the session id arrives asynchronously via the stream. Simplest: in `get_factory`/`agent` GET, if `agents.get(key).session_id` is `Some` and the store's TF `agent_session_id` is `None`, persist it via `factory::set_agent_session` + save. (A lightweight reconcile; avoids threading a callback into the supervisor.)

- [ ] **Step 5: Launch-on-create (optional flag).** `post_task_force` accepts `{ start?: bool }`; when true, after creating the worktree it calls the same start logic. Default false (create only) to keep Plan 02 behavior.

- [ ] **Step 6: Stop-on-exit.** In `main.rs`, where `RunEvent::Exit` calls `procs.kill_all()`, also call `agents.kill_all()` when `config::load().factory.stop_agents_on_exit` is true.

- [ ] **Step 7: Verify.**
  - `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features` → factory + agents + config tests pass.
  - `cargo build --manifest-path src-tauri/Cargo.toml --lib --no-default-features` → clean.
  - `npm run test:server:rust 2>&1 | tail -4` → `# fail 0`.
  - `npx tsc --noEmit -p . && npm run build` → clean (Task 1 frontend bits).

- [ ] **Step 8: Commit** `feat(factory): wire agent supervisor into app (WS + endpoints + lifecycle)`.

## Verification (whole plan)

- All Rust unit tests pass (config + factory + agents); build clean; 75 parity green; tsc + web build clean.
- Manual (desktop): create a Task Force with `start:true` → the cockpit WS receives `agent-event`/`agent-status`; sending a message produces a new turn; stop kills it; on relaunch the stored `agentSessionId` allows `--resume`.

## Notes / follow-ups

- **CI gap (pre-existing):** the Rust `--lib` unit tests (factory + agents) aren't run in CI yet (only `test:server:rust` is). The agents tests also need `node` on the runner. Consider adding a `cargo test --lib` CI step in a later pass.
- **Interactive approvals** remain out of scope (permission-mode trust). The future Node agent-sidecar (Agent SDK `canUseTool`) would slot in behind the same `agent/message` + a new `agent/permission` endpoint without changing the store or cockpit shape.
- **Plan 04** (cockpit UI) consumes `agent-event`/`agent-status` over WS + the `agent/*` endpoints. **Plan 05** (attention/inbox) reuses `AgentStatus` + `needs_action`.
