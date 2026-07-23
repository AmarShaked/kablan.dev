# Changelog

All notable changes to Kablan.dev are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-07-23

### Added
- **GitLab integration** (desktop app): connect a GitLab host in
  Settings → Integrations with a Personal Access Token (stored in the OS
  keychain). Rows show CI pipeline status and open-MR badges; a dedicated
  **GitLab tab** in the item drawer shows the project, the branch's Merge Request
  and pipeline, and a **Create Merge Request** form. New "Has open MR" /
  "CI failing" filters. Works with gitlab.com and self-hosted; the provider is
  auto-detected from the repo's origin remote.
- **Settings → Integrations tab** grouping the GitLab and Linear configuration.
- Real brand logos (GitLab, VS Code, Linear) across the "Open in…" menu, Linear
  ticket links, and the integration cards.

## [0.1.7] - 2026-07-22

### Changed
- **Minimal, Linear-style filter bar** — the row of dropdowns is replaced by a
  single **Filter** menu (Author / Updated / Location submenus + Running /
  Has Linear / Main-only toggles), with applied filters shown as removable chips,
  a filter count, and "Clear all".

### Added
- **New filters**: Main branches only, Has Linear ticket, and Location
  (Local only / Remote only).
- **Check for updates** button in Settings → General (About & updates), showing
  the current version.

## [0.1.6] - 2026-07-22

### Added
- **In-app auto-update** (macOS/Windows/Linux). The desktop app now checks for
  new signed releases and installs them **in place** — the update banner shows
  "Update & restart" instead of a download link. Because updates aren't
  downloaded through a browser, macOS no longer re-quarantines the app, so you
  won't have to re-approve it in Security settings on every new version.
  (The very first install of an unsigned build still needs the one-time
  approval; from this version on, updates are seamless.)

## [0.1.5] - 2026-07-22

### Added
- **Fetch button** — runs `git fetch --all --prune` for the project so new remote
  branches (and pruned ones) show up without a terminal.
- **Remote-only branches** now appear in the list with a **remote** badge. You can
  check one out directly (it creates a local tracking branch) or "Check out & run".
- **Pull from the branch drawer** — an always-available Pull button that pulls from
  the remote and reports **"Already up to date."** when there's nothing new.

## [0.1.4] - 2026-07-22

### Fixed
- **Dev servers wouldn't start in the packaged app** (success toast, but nothing
  ran). GUI-launched apps inherit a minimal `PATH`, so `npm`/`node`/`pnpm`
  weren't found. The app now resolves your login shell's real `PATH` at startup
  and applies it process-wide, so child processes (and git) find your tools.

### Changed
- **Failures are no longer silent** — a dev server that exits abnormally (e.g.
  "command not found", a crashed dev command) now raises a toast, and a server's
  **Logs remain viewable after it exits** so you can see why it died.

## [0.1.3] - 2026-07-21

### Changed
- **macOS ships separate native builds per architecture** and the download page
  leads with **Apple Silicon** (native — no Rosetta, no "won't run in future
  macOS" warning), with an Intel `.dmg` link alongside. (A universal build was
  attempted in 0.1.2 but Tauri only `lipo`s the main binary, leaving the extra
  `kablan-server` binary without a universal artifact and failing the bundle, so
  per-arch builds are used instead. 0.1.2 was not fully released.)

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

[Unreleased]: https://github.com/AmarShaked/kablan.dev/compare/v0.1.7...HEAD
[0.1.7]: https://github.com/AmarShaked/kablan.dev/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/AmarShaked/kablan.dev/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/AmarShaked/kablan.dev/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/AmarShaked/kablan.dev/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/AmarShaked/kablan.dev/compare/v0.1.1...v0.1.3
[0.1.1]: https://github.com/AmarShaked/kablan.dev/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/AmarShaked/kablan.dev/releases/tag/v0.1.0
