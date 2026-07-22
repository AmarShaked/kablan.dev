//! External app/URL launcher — mirrors server/open.ts. std-only (no tauri) so it
//! compiles into the headless `kablan-server` binary as well as the desktop app.
use std::io::ErrorKind;
use std::process::Command;

/// Launch an external app/URL. `arg` is a directory path (editors/terminal/finder)
/// or a URL ("url"). Returns Ok(()) when the launcher exits 0 (or with no code),
/// or Err with its error (e.g. the editor CLI isn't installed) so the UI can surface it.
pub fn open_target(target: &str, arg: &str) -> Result<(), String> {
    let plat = std::env::consts::OS;
    let (cmd, args): (&str, Vec<String>) = match target {
        "url" | "finder" => {
            let cmd = match plat {
                "macos" => "open",
                "windows" => "explorer",
                _ => "xdg-open",
            };
            (cmd, vec![arg.to_string()])
        }
        "terminal" => match plat {
            "macos" => ("open", vec!["-a".into(), "Terminal".into(), arg.to_string()]),
            "windows" => (
                "cmd",
                vec![
                    "/c".into(),
                    "start".into(),
                    "cmd".into(),
                    "/K".into(),
                    format!("cd /d {arg}"),
                ],
            ),
            _ => ("x-terminal-emulator", vec![]),
        },
        "iterm" => ("open", vec!["-a".into(), "iTerm".into(), arg.to_string()]),
        "vscode" => ("code", vec![arg.to_string()]),
        "cursor" => ("cursor", vec![arg.to_string()]),
        _ => return Err(format!("Unknown open target: {target}")),
    };

    let status = Command::new(cmd).args(&args).status();
    match status {
        Ok(s) => {
            if s.success() {
                Ok(())
            } else {
                match s.code() {
                    Some(code) => Err(format!("{cmd} exited with code {code}")),
                    None => Ok(()),
                }
            }
        }
        Err(e) => {
            if e.kind() == ErrorKind::NotFound {
                Err(format!("{cmd} is not installed or not on PATH"))
            } else {
                Err(e.to_string())
            }
        }
    }
}
