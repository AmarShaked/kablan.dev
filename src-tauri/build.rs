fn main() {
    // Only run Tauri's build-time codegen when building the desktop app; the
    // standalone `kablan-server` binary (used by tests) doesn't need it.
    #[cfg(feature = "app")]
    tauri_build::build();
}
