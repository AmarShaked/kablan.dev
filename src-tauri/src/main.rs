// Prevent an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::{RunEvent, WebviewUrl, WebviewWindowBuilder};

/// Grab a free TCP port from the OS (bind to :0, read it, release).
fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(4317)
}

/// GUI-launched apps (Finder/Dock) inherit a minimal PATH (~`/usr/bin:/bin`),
/// so tools installed via Homebrew/nvm/asdf (npm, node, pnpm, …) aren't found
/// and dev servers fail to start. Resolve the user's real login-shell PATH and
/// apply it process-wide so every child spawn (and git) sees it.
#[cfg(unix)]
fn augment_path() {
    use std::process::Command;
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let resolved = Command::new(&shell)
        .args(["-ilc", "printf %s \"$PATH\""])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty());
    let mut path = resolved.unwrap_or_else(|| std::env::var("PATH").unwrap_or_default());
    // Belt-and-suspenders: make sure the usual install dirs are present.
    for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"] {
        if !path.split(':').any(|p| p == dir) {
            path = format!("{dir}:{path}");
        }
    }
    std::env::set_var("PATH", path);
}
#[cfg(not(unix))]
fn augment_path() {}

fn main() {
    augment_path();
    let port = free_port();

    // Run the native Axum backend in the background on its own runtime, sharing
    // a process registry so we can shut child dev servers down on quit.
    let procs = kablan::processes::Processes::new();
    let agents = kablan::agents::Agents::new();
    let procs_for_server = Arc::clone(&procs);
    let agents_for_server = Arc::clone(&agents);
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        rt.block_on(kablan::serve_on_with(port, procs_for_server, agents_for_server));
    });

    // Injected before any page script so the web UI knows where the backend is.
    let init = format!("window.__KABLAN_PORT__ = {port};");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            let mut b = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Kablan.dev")
                .inner_size(1280.0, 820.0)
                .min_inner_size(900.0, 600.0)
                .initialization_script(&init);
            // Slack-style overlay title bar: the mac traffic-lights float over our own titlebar
            // row (which reserves space for them) instead of Tauri drawing its native bar above
            // our content — `hidden_title` drops the OS-drawn window title text since we don't
            // show one.
            #[cfg(target_os = "macos")]
            {
                b = b
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true)
                    // Vertically center the traffic-lights within our 46px title-bar row
                    // ((46 - 12)/2 ≈ 17). x is the standard left margin.
                    .traffic_light_position(tauri::LogicalPosition::new(19.0, 17.0));
            }
            b.build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Kablan.dev");

    app.run(move |_app, event| {
        if let RunEvent::Exit = event {
            procs.kill_all();
            if kablan::config::load().factory.stop_agents_on_exit {
                agents.kill_all();
            }
        }
    });
}
