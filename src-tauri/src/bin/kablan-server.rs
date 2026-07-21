//! Standalone entrypoint for the Kablan.dev backend. In the packaged Tauri app
//! this same server is launched in-process; here it runs on its own so the
//! shared server test suite can validate behavioral parity with the Node server.
#[tokio::main]
async fn main() {
    kablan::run().await;
}
