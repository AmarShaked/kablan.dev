//! Dev-server process management — mirrors server/processes.ts.
//! One server per project (starting a new one replaces the old); processes run
//! in their own group so the whole tree can be killed. Log + status events are
//! broadcast as pre-serialized WS messages.
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

    pub fn get_server(&self, project: &str) -> Option<RunningServer> {
        self.registry.lock().unwrap().get(project).map(|r| r.view.clone())
    }

    pub fn get_all(&self) -> Vec<RunningServer> {
        self.registry.lock().unwrap().values().map(|r| r.view.clone()).collect()
    }

    pub fn get_logs(&self, project: &str) -> Vec<LogLine> {
        self.registry
            .lock()
            .unwrap()
            .get(project)
            .map(|r| r.logs.clone())
            .unwrap_or_default()
    }

    fn emit_update(&self, project: &str) {
        let server = self.get_server(project);
        let msg = json!({ "type": "status", "projectName": project, "server": server });
        let _ = self.tx.send(msg.to_string());
    }

    fn push_log(&self, project: &str, line: LogLine) {
        let max = config::load().max_log_lines as usize;
        {
            let mut reg = self.registry.lock().unwrap();
            match reg.get_mut(project) {
                Some(rec) => {
                    rec.logs.push(line.clone());
                    if rec.logs.len() > max {
                        let excess = rec.logs.len() - max;
                        rec.logs.drain(0..excess);
                    }
                }
                None => return,
            }
        }
        let msg = json!({ "type": "log", "projectName": project, "line": line });
        let _ = self.tx.send(msg.to_string());
    }

    pub fn start(
        self: &Arc<Self>,
        project: &str,
        cwd: &str,
        command: &str,
        branch: Option<String>,
    ) -> RunningServer {
        // Enforce single-server-per-project: stop any existing one first.
        self.stop(project, true);

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
            project.to_string(),
            ServerRecord { view, logs: vec![], generation },
        );
        self.push_log(
            project,
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
                    if let Some(r) = reg.get_mut(project) {
                        r.view.status = "error".into();
                    }
                }
                self.push_log(
                    project,
                    LogLine { ts: now_ms(), stream: "system".into(), text: format!("Process error: {e}") },
                );
                self.emit_update(project);
                return self.get_server(project).unwrap();
            }
        };

        let pid = child.id() as i32;
        {
            let mut reg = self.registry.lock().unwrap();
            if let Some(r) = reg.get_mut(project) {
                r.view.pid = Some(pid);
                r.view.status = "running".into();
            }
        }
        self.emit_update(project);

        if let Some(mut out) = child.stdout.take() {
            let me = Arc::clone(self);
            let proj = project.to_string();
            std::thread::spawn(move || read_stream(&mut out, "stdout", &me, &proj));
        }
        if let Some(mut err) = child.stderr.take() {
            let me = Arc::clone(self);
            let proj = project.to_string();
            std::thread::spawn(move || read_stream(&mut err, "stderr", &me, &proj));
        }

        // Waiter thread owns the child and reflects its exit (if still current).
        let me = Arc::clone(self);
        let proj = project.to_string();
        std::thread::spawn(move || {
            let status = child.wait();
            let code = status.as_ref().ok().and_then(|s| s.code());
            #[cfg(unix)]
            let signal = status.as_ref().ok().and_then(|s| s.signal());
            #[cfg(not(unix))]
            let signal: Option<i32> = None;

            let mut fire = false;
            {
                let mut reg = me.registry.lock().unwrap();
                if let Some(r) = reg.get_mut(&proj) {
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
                        fire = true;
                    }
                }
            }
            if fire {
                if let Some(line) = me.get_logs(&proj).last().cloned() {
                    let _ = me.tx.send(json!({ "type": "log", "projectName": proj, "line": line }).to_string());
                }
                me.emit_update(&proj);
            }
        });

        self.get_server(project).unwrap()
    }

    pub fn stop(&self, project: &str, silent: bool) -> bool {
        let pid = {
            let reg = self.registry.lock().unwrap();
            match reg.get(project) {
                Some(r) if r.view.pid.is_some() => r.view.pid.unwrap(),
                _ => return false,
            }
        };
        if !silent {
            self.push_log(
                project,
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

fn read_stream<R: Read>(reader: &mut R, stream: &str, me: &Arc<Processes>, project: &str) {
    let mut buf = [0u8; 8192];
    loop {
        match reader.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                let text = String::from_utf8_lossy(&buf[..n]).to_string();
                me.push_log(project, LogLine { ts: now_ms(), stream: stream.into(), text });
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
