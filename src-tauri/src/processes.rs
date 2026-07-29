//! Dev-server process management — mirrors server/processes.ts.
//! Servers are keyed by their working-copy `cwd` (an absolute, globally-unique
//! path), so multiple working copies of the same project can run at once;
//! starting again in the SAME cwd replaces (kill + restart) the server there.
//! Processes run in their own group so the whole tree can be killed. Log +
//! status events are broadcast as pre-serialized WS messages tagged with both
//! `projectName` and `cwd`.
use crate::config;
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::broadcast;

#[cfg(unix)]
use std::os::unix::process::{CommandExt, ExitStatusExt};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub ts: i64,
    pub stream: String,
    pub text: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningServer {
    pub project_name: String,
    pub cwd: String,
    pub command: String,
    pub branch: Option<String>,
    pub pid: Option<i32>,
    pub status: String,
    pub started_at: i64,
    pub exit_code: Option<i32>,
}

struct ServerRecord {
    view: RunningServer,
    logs: Vec<LogLine>,
    generation: u64,
}

pub struct Processes {
    registry: Mutex<HashMap<String, ServerRecord>>,
    tx: broadcast::Sender<String>,
    gen: AtomicU64,
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

impl Processes {
    pub fn new() -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(2048);
        Arc::new(Processes {
            registry: Mutex::new(HashMap::new()),
            tx,
            gen: AtomicU64::new(0),
        })
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.tx.subscribe()
    }

    pub fn get_server(&self, cwd: &str) -> Option<RunningServer> {
        self.registry.lock().unwrap().get(cwd).map(|r| r.view.clone())
    }

    pub fn get_all(&self) -> Vec<RunningServer> {
        self.registry.lock().unwrap().values().map(|r| r.view.clone()).collect()
    }

    pub fn get_logs(&self, cwd: &str) -> Vec<LogLine> {
        self.registry
            .lock()
            .unwrap()
            .get(cwd)
            .map(|r| r.logs.clone())
            .unwrap_or_default()
    }

    fn emit_update(&self, cwd: &str) {
        let (project, server) = {
            let reg = self.registry.lock().unwrap();
            match reg.get(cwd) {
                Some(r) => (r.view.project_name.clone(), Some(r.view.clone())),
                None => return,
            }
        };
        let msg = json!({ "type": "status", "projectName": project, "cwd": cwd, "server": server });
        let _ = self.tx.send(msg.to_string());
    }

    fn push_log(&self, cwd: &str, line: LogLine) {
        let max = config::load().max_log_lines as usize;
        let project = {
            let mut reg = self.registry.lock().unwrap();
            match reg.get_mut(cwd) {
                Some(rec) => {
                    rec.logs.push(line.clone());
                    if rec.logs.len() > max {
                        let excess = rec.logs.len() - max;
                        rec.logs.drain(0..excess);
                    }
                    rec.view.project_name.clone()
                }
                None => return,
            }
        };
        let msg = json!({ "type": "log", "projectName": project, "cwd": cwd, "line": line });
        let _ = self.tx.send(msg.to_string());
    }

    pub fn start(
        self: &Arc<Self>,
        project: &str,
        cwd: &str,
        command: &str,
        branch: Option<String>,
    ) -> RunningServer {
        // One server per working-copy cwd: stop any existing one at this cwd first.
        self.stop(cwd, true);

        let generation = self.gen.fetch_add(1, Ordering::SeqCst) + 1;
        let started_at = now_ms();
        let view = RunningServer {
            project_name: project.to_string(),
            cwd: cwd.to_string(),
            command: command.to_string(),
            branch,
            pid: None,
            status: "starting".to_string(),
            started_at,
            exit_code: None,
        };
        self.registry.lock().unwrap().insert(
            cwd.to_string(),
            ServerRecord { view, logs: vec![], generation },
        );
        self.push_log(
            cwd,
            LogLine { ts: now_ms(), stream: "system".into(), text: format!("$ {command}  (cwd: {cwd})") },
        );

        // Run through the shell so commands like "npm run dev" work as typed.
        let mut cmd = Command::new("sh");
        cmd.arg("-c")
            .arg(command)
            .current_dir(cwd)
            .env("FORCE_COLOR", "0")
            .env("NO_COLOR", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(unix)]
        cmd.process_group(0); // own process group so we can kill the whole tree

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                {
                    let mut reg = self.registry.lock().unwrap();
                    if let Some(r) = reg.get_mut(cwd) {
                        r.view.status = "error".into();
                    }
                }
                self.push_log(
                    cwd,
                    LogLine { ts: now_ms(), stream: "system".into(), text: format!("Process error: {e}") },
                );
                self.emit_update(cwd);
                return self.get_server(cwd).unwrap();
            }
        };

        let pid = child.id() as i32;
        {
            let mut reg = self.registry.lock().unwrap();
            if let Some(r) = reg.get_mut(cwd) {
                r.view.pid = Some(pid);
                r.view.status = "running".into();
            }
        }
        self.emit_update(cwd);

        if let Some(mut out) = child.stdout.take() {
            let me = Arc::clone(self);
            let key = cwd.to_string();
            std::thread::spawn(move || read_stream(&mut out, "stdout", &me, &key));
        }
        if let Some(mut err) = child.stderr.take() {
            let me = Arc::clone(self);
            let key = cwd.to_string();
            std::thread::spawn(move || read_stream(&mut err, "stderr", &me, &key));
        }

        // Waiter thread owns the child and reflects its exit (if still current).
        let me = Arc::clone(self);
        let key = cwd.to_string();
        std::thread::spawn(move || {
            let status = child.wait();
            let code = status.as_ref().ok().and_then(|s| s.code());
            #[cfg(unix)]
            let signal = status.as_ref().ok().and_then(|s| s.signal());
            #[cfg(not(unix))]
            let signal: Option<i32> = None;

            let mut fire: Option<String> = None;
            {
                let mut reg = me.registry.lock().unwrap();
                if let Some(r) = reg.get_mut(&key) {
                    if r.generation == generation {
                        r.view.status = if r.view.status == "starting" { "error" } else { "exited" }.into();
                        r.view.exit_code = code;
                        r.view.pid = None;
                        let text = format!(
                            "Process exited (code={}{})",
                            code.map(|c| c.to_string()).unwrap_or_else(|| "null".into()),
                            signal.map(|s| format!(", signal={s}")).unwrap_or_default()
                        );
                        r.logs.push(LogLine { ts: now_ms(), stream: "system".into(), text });
                        fire = Some(r.view.project_name.clone());
                    }
                }
            }
            if let Some(project) = fire {
                if let Some(line) = me.get_logs(&key).last().cloned() {
                    let _ = me.tx.send(
                        json!({ "type": "log", "projectName": project, "cwd": key, "line": line }).to_string(),
                    );
                }
                me.emit_update(&key);
            }
        });

        self.get_server(cwd).unwrap()
    }

    pub fn stop(&self, cwd: &str, silent: bool) -> bool {
        let pid = {
            let reg = self.registry.lock().unwrap();
            match reg.get(cwd) {
                Some(r) if r.view.pid.is_some() => r.view.pid.unwrap(),
                _ => return false,
            }
        };
        if !silent {
            self.push_log(
                cwd,
                LogLine { ts: now_ms(), stream: "system".into(), text: "Stopping server...".into() },
            );
        }
        kill_group(pid, false);
        // Escalate to SIGKILL if it lingers.
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(4000));
            kill_group(pid, true);
        });
        true
    }

    pub fn kill_all(&self) {
        let reg = self.registry.lock().unwrap();
        for r in reg.values() {
            if let Some(pid) = r.view.pid {
                kill_group(pid, true);
            }
        }
    }
}

fn read_stream<R: Read>(reader: &mut R, stream: &str, me: &Arc<Processes>, cwd: &str) {
    let mut buf = [0u8; 8192];
    loop {
        match reader.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                let text = String::from_utf8_lossy(&buf[..n]).to_string();
                me.push_log(cwd, LogLine { ts: now_ms(), stream: stream.into(), text });
            }
        }
    }
}

#[cfg(unix)]
fn kill_group(pid: i32, force: bool) {
    use nix::sys::signal::{killpg, Signal};
    use nix::unistd::Pid;
    let sig = if force { Signal::SIGKILL } else { Signal::SIGTERM };
    let _ = killpg(Pid::from_raw(pid), sig);
}

#[cfg(not(unix))]
fn kill_group(_pid: i32, _force: bool) {
    // Windows process-tree termination is handled separately in the packaged app.
}

/// Public wrapper so other supervisors (e.g. `agents.rs`) can reuse the same
/// process-group kill logic without duplicating it.
pub fn kill_group_pub(pid: i32, force: bool) {
    kill_group(pid, force);
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> String {
        let p = std::env::temp_dir().join(format!("kablan-proc-{}-{}", tag, std::process::id()));
        std::fs::create_dir_all(&p).unwrap();
        p.to_string_lossy().to_string()
    }

    // A benign, long-lived child so the registry has a live pid to key on.
    const IDLE: &str = "sleep 100";

    fn wait_running(p: &Arc<Processes>, cwd: &str) {
        for _ in 0..50 {
            if matches!(p.get_server(cwd).map(|s| s.status), Some(ref st) if st == "running") {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
    }

    #[test]
    fn two_cwds_coexist_same_cwd_replaces_and_stop_by_cwd() {
        let p = Processes::new();
        let a = tmpdir("a");
        let b = tmpdir("b");

        // Two different working copies of the same project run concurrently.
        p.start("proj", &a, IDLE, None);
        p.start("proj", &b, IDLE, None);
        wait_running(&p, &a);
        wait_running(&p, &b);
        assert_eq!(p.get_all().len(), 2, "both cwds coexist");
        assert!(p.get_server(&a).is_some());
        assert!(p.get_server(&b).is_some());
        assert_eq!(p.get_server(&a).unwrap().project_name, "proj");

        // Starting again in the SAME cwd replaces (still 2 records total).
        let first_started = p.get_server(&a).unwrap().started_at;
        std::thread::sleep(std::time::Duration::from_millis(5));
        p.start("proj", &a, IDLE, None);
        wait_running(&p, &a);
        assert_eq!(p.get_all().len(), 2, "same cwd replaces, does not add");
        assert!(p.get_server(&a).unwrap().started_at >= first_started);

        // Stop by cwd targets only that working copy; the other keeps its pid.
        assert!(p.stop(&a, true), "stop returns true when a live server exists");
        assert!(p.get_server(&b).unwrap().pid.is_some(), "the other cwd is untouched");

        // Stopping a cwd with nothing live returns false.
        let unknown = tmpdir("nope");
        assert!(!p.stop(&unknown, true));

        p.stop(&b, true);
        p.kill_all();
    }
}
