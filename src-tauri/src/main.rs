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

fn main() {
    let port = free_port();

    // Run the native Axum backend in the background on its own runtime, sharing
    // a process registry so we can shut child dev servers down on quit.
    let procs = kablan::processes::Processes::new();
    let procs_for_server = Arc::clone(&procs);
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        rt.block_on(kablan::serve_on_with(port, procs_for_server));
    });

    // Injected before any page script so the web UI knows where the backend is.
    let init = format!("window.__KABLAN_PORT__ = {port};");

    let app = tauri::Builder::default()
        .setup(move |app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Kablan.dev")
                .inner_size(1280.0, 820.0)
                .min_inner_size(900.0, 600.0)
                .initialization_script(&init)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Kablan.dev");

    app.run(move |_app, event| {
        if let RunEvent::Exit = event {
            procs.kill_all();
        }
    });
}
