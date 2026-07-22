# Changelog

All notable changes to Kablan.dev are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-07-21

### Changed
- **macOS is now a single universal build** (`universal-apple-darwin`) — one
  `.dmg` that runs natively on both Apple Silicon and Intel. No more picking the
  right architecture, and no Rosetta "won't run in future macOS" warning for
  Apple Silicon users. The download page prefers the universal artifact.

## [0.1.1] - 2026-07-21

### Fixed
- **macOS "app is damaged" on first launch** — the app bundle is now ad-hoc
  signed, so Gatekeeper shows the standard "unidentified developer" prompt
  (bypassable via right-click → Open / System Settings → Open Anyway) instead of
  refusing to open. If you still hit it on a downloaded build, clear the
  quarantine flag once: `xattr -dr com.apple.quarantine /Applications/Kablan.dev.app`.

## [0.1.0] - 2026-07-21

Initial public release. 🎉

### Added
- **Project cockpit** — recursively discovers every git repo under a parent
  folder (nested repos like `acme/frontend/app` are grouped by relative path),
  with a fast filterable sidebar and per-project icons.
- **Branches & worktrees** in one unified, virtualized list — current branch,
  ahead/behind vs. upstream, per-item commit-activity heatmap (last 6 months,
  scoped to each branch's fork point), and Linear ticket links.
- **Dev servers** — start/stop a dev server per project straight from any row
  (one server per project; starting a new one replaces the old), with live
  console logs streamed over WebSocket.
- **Environment editor** — view and edit each project's / worktree's `.env`
  files in-app.
- **Git actions** — check out branches and pull (including fast-forwarding
  branches that aren't checked out) without leaving the app.
- **Light / dark theme**, warm Claude-style palette.
- **Native Rust backend** (Axum) packaged as a cross-platform **Tauri** desktop
  app for macOS, Windows, and Linux.
- **In-app update check** — notifies you when a newer release is available.
- **Full behavioral test suite** — 64 black-box tests that run against both the
  reference Node server and the Rust backend to guarantee parity.

[Unreleased]: https://github.com/AmarShaked/kablan.dev/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/AmarShaked/kablan.dev/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/AmarShaked/kablan.dev/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/AmarShaked/kablan.dev/releases/tag/v0.1.0
