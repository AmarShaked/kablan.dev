//! Persistent per-agent chat transcripts on disk (JSONL), with day-based
//! retention. One file per agent key under `config_dir()/chat_history`.
//!
//! Everything here is best-effort: the append path runs inside the hot stdout
//! reader thread in `agents.rs`, so IO errors are logged-and-ignored and never
//! panic or propagate.
use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

/// Directory holding the per-key JSONL transcript files.
fn history_dir() -> PathBuf {
    crate::config::config_dir().join("chat_history")
}

/// Filesystem-safe slug of an agent key. Keeps `[A-Za-z0-9._-]`, replaces every
/// other char with `-`. Deterministic so the same key always maps to the same
/// file across restarts.
fn slug_key(key: &str) -> String {
    let mut out = String::with_capacity(key.len());
    for c in key.chars() {
        if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
            out.push(c);
        } else {
            out.push('-');
        }
    }
    if out.is_empty() {
        "item".to_string()
    } else {
        out
    }
}

fn file_for(key: &str) -> PathBuf {
    history_dir().join(format!("{}.jsonl", slug_key(key)))
}

/// Append one event as a single JSON line. Best-effort: creates the directory
/// and file as needed; on any IO error, logs to stderr and returns.
pub fn append_event(key: &str, event: &Value) {
    let dir = history_dir();
    if let Err(e) = fs::create_dir_all(&dir) {
        eprintln!("chat_history: create_dir_all failed: {e}");
        return;
    }
    let line = match serde_json::to_string(event) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("chat_history: serialize event failed: {e}");
            return;
        }
    };
    let path = file_for(key);
    match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(mut f) => {
            if let Err(e) = writeln!(f, "{line}") {
                eprintln!("chat_history: append write failed for {}: {e}", path.display());
            }
        }
        Err(e) => eprintln!("chat_history: open failed for {}: {e}", path.display()),
    }
}

/// Read a key's persisted transcript back into a Vec. Malformed lines are
/// skipped. Empty when no file exists.
pub fn load_events(key: &str) -> Vec<Value> {
    let path = file_for(key);
    let file = match fs::File::open(&path) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };
    let rdr = BufReader::new(file);
    let mut out = Vec::new();
    for line in rdr.lines().map_while(Result::ok) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(line) {
            out.push(v);
        }
    }
    out
}

/// Delete transcript files whose last-modified time is older than `days` days.
/// `days == 0` keeps everything forever (no-op). Best-effort.
pub fn prune(days: u32) {
    if days == 0 {
        return;
    }
    let dir = history_dir();
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return, // no dir yet — nothing to prune
    };
    let cutoff = match SystemTime::now().checked_sub(Duration::from_secs(days as u64 * 86_400)) {
        Some(t) => t,
        None => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_jsonl = path.extension().map(|e| e == "jsonl").unwrap_or(false);
        if !is_jsonl {
            continue;
        }
        let modified = entry.metadata().ok().and_then(|m| m.modified().ok());
        if let Some(mtime) = modified {
            if mtime < cutoff {
                if let Err(e) = fs::remove_file(&path) {
                    eprintln!("chat_history: prune remove failed for {}: {e}", path.display());
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Point config_dir at a fresh temp dir for the duration of a test. Tests in
    /// this module run single-threaded (`--test-threads=1`), so mutating the
    /// process env var is safe.
    struct TempConfig {
        dir: PathBuf,
    }
    impl TempConfig {
        fn new(tag: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "kablan-chathist-{tag}-{}",
                SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_nanos()
            ));
            let _ = fs::remove_dir_all(&dir);
            std::env::set_var("KABLAN_CONFIG_DIR", &dir);
            TempConfig { dir }
        }
    }
    impl Drop for TempConfig {
        fn drop(&mut self) {
            std::env::remove_var("KABLAN_CONFIG_DIR");
            let _ = fs::remove_dir_all(&self.dir);
        }
    }

    #[test]
    fn append_then_load_round_trip() {
        let _cfg = TempConfig::new("roundtrip");
        let key = "proj::branch:feat/foo";
        assert!(load_events(key).is_empty());
        append_event(key, &json!({"type":"assistant","n":1}));
        append_event(key, &json!({"type":"result","is_error":false,"n":2}));
        let evs = load_events(key);
        assert_eq!(evs.len(), 2);
        assert_eq!(evs[0]["type"], "assistant");
        assert_eq!(evs[1]["n"], 2);
    }

    #[test]
    fn load_skips_malformed_lines() {
        let _cfg = TempConfig::new("malformed");
        let key = "p::branch:b";
        append_event(key, &json!({"ok":true}));
        // Inject a bad line directly.
        let path = file_for(key);
        let mut f = OpenOptions::new().append(true).open(&path).unwrap();
        writeln!(f, "not json at all").unwrap();
        writeln!(f, "").unwrap();
        append_event(key, &json!({"ok":false}));
        let evs = load_events(key);
        assert_eq!(evs.len(), 2);
        assert_eq!(evs[0]["ok"], true);
        assert_eq!(evs[1]["ok"], false);
    }

    #[test]
    fn distinct_keys_use_distinct_files() {
        let _cfg = TempConfig::new("distinct");
        append_event("a::branch:x", &json!({"k":"a"}));
        append_event("b::branch:y", &json!({"k":"b"}));
        assert_eq!(load_events("a::branch:x").len(), 1);
        assert_eq!(load_events("b::branch:y").len(), 1);
        assert_eq!(load_events("a::branch:x")[0]["k"], "a");
    }

    #[test]
    fn prune_zero_keeps_everything() {
        let _cfg = TempConfig::new("prune-zero");
        let key = "p::branch:keep";
        append_event(key, &json!({"keep":true}));
        prune(0); // no-op: keep forever
        assert_eq!(load_events(key).len(), 1);
    }

    #[test]
    fn prune_keeps_fresh_files() {
        let _cfg = TempConfig::new("prune-fresh");
        let key = "p::branch:fresh";
        append_event(key, &json!({"fresh":true}));
        // Just-written file is well within any positive retention window.
        prune(30);
        assert_eq!(load_events(key).len(), 1);
    }

    #[test]
    fn prune_missing_dir_is_noop() {
        let _cfg = TempConfig::new("prune-missing");
        // No history dir has been created yet.
        prune(30); // must not panic
        assert!(load_events("p::branch:none").is_empty());
    }
}
