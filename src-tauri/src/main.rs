// Prevent an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};

use server::{DeploymentImpl, run};
use tauri::{RunEvent, WebviewUrl, WebviewWindowBuilder};
use utils::sentry::SentrySource;

/// A GUI-launched app inherits a minimal PATH (roughly `/usr/bin:/bin`), so the coding agents,
/// node, pnpm and anything else installed through Homebrew, nvm or asdf are simply not found —
/// and every task fails at the first command. Ask the user's login shell what their PATH really
/// is and adopt it, so children spawned from here see the same tools their terminal does.
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
    for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"] {
        if !path.split(':').any(|p| p == dir) {
            path = format!("{dir}:{path}");
        }
    }
    unsafe { std::env::set_var("PATH", path) };
}

#[cfg(not(unix))]
fn augment_path() {}

fn main() {
    augment_path();
    run::init_process(SentrySource::Backend);

    // The server binds port 0 and tells us what it got, so two copies of the app — or a `pnpm
    // dev` already running — never collide. The window can't be built until that port is known.
    let (port_tx, port_rx) = std::sync::mpsc::channel::<u16>();
    let deployment_slot: Arc<Mutex<Option<DeploymentImpl>>> = Arc::new(Mutex::new(None));
    let deployment_for_server = Arc::clone(&deployment_slot);

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        rt.block_on(async move {
            let bound = match run::bind("127.0.0.1", 0).await {
                Ok(bound) => bound,
                Err(e) => {
                    tracing::error!("Kablan's server failed to start: {e}");
                    // Nothing to show a window for; let the channel close so main can report it.
                    return;
                }
            };
            *deployment_for_server.lock().unwrap() = Some(bound.deployment.clone());
            let _ = port_tx.send(bound.port);
            if let Err(e) = bound.serve(std::future::pending()).await {
                tracing::error!("Kablan's server stopped: {e}");
            }
        });
    });

    let port = match port_rx.recv() {
        Ok(port) => port,
        Err(_) => {
            eprintln!("Kablan could not start its server. See the log for details.");
            std::process::exit(1);
        }
    };

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            // The server embeds and serves the built frontend, so the window points at it rather
            // than at bundled assets: one code path serves the browser and the app alike.
            //
            // KABLAN_DEV_URL overrides that with the Vite dev server, which is the only way to
            // get hot reload inside the window — the embedded copy is whatever was last built.
            // It is read in debug builds only, so a release binary can never be pointed
            // somewhere else by an environment variable.
            let target = if cfg!(debug_assertions) {
                std::env::var("KABLAN_DEV_URL")
                    .unwrap_or_else(|_| format!("http://127.0.0.1:{port}"))
            } else {
                format!("http://127.0.0.1:{port}")
            };
            let url = target.parse().expect("valid url for the app window");

            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Kablan")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1000.0, 640.0);

            #[cfg(target_os = "macos")]
            {
                builder = builder.title_bar_style(tauri::TitleBarStyle::Transparent);
            }

            builder.build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Kablan");

    app.run(move |_app, event| {
        if let RunEvent::Exit = event {
            // Agents and dev servers are children of this process; leaving them running after the
            // window closes would strand them with no way to reach them.
            if let Some(deployment) = deployment_slot.lock().unwrap().clone() {
                let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
                rt.block_on(run::perform_cleanup_actions(&deployment));
            }
        }
    });
}
