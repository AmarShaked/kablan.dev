<div align="center">

# Kablan.dev

**Your local dev environment, under one roof.**

Kablan.dev is a desktop cockpit for the projects you hack on every day. See every
git repo at a glance, jump between branches and worktrees, edit `.env` files, and
start/stop dev servers with live logs — without a terminal tab graveyard.

[**⬇ Download**](https://amarshaked.github.io/kablan.dev/) · [Changelog](CHANGELOG.md) · [Report a bug](https://github.com/AmarShaked/kablan.dev/issues)

</div>

---

## Features

- 🗂️ **Project cockpit** — recursively finds every git repo under a folder you
  choose. Nested repos (`acme/frontend/app`) stay grouped and searchable.
- 🌿 **Branches & worktrees** in one virtualized list — current branch,
  ahead/behind vs. upstream, and a per-branch commit-activity heatmap.
- ▶️ **Dev servers** — start/stop per project from any row, one server per
  project, with live console logs.
- 🔑 **Environment editor** — edit each project's and worktree's `.env` files
  in-app.
- 🔀 **Git actions** — check out and pull (even fast-forward branches that aren't
  checked out) without a terminal.
- 🔗 **Linear links** — branches/worktrees with a ticket id link straight to
  Linear.
- 🌗 **Light / dark** themes.

## Install

Grab the latest build for your OS from the [**download page**](https://amarshaked.github.io/kablan.dev/)
or the [releases page](https://github.com/AmarShaked/kablan.dev/releases/latest):

| OS | File |
|----|------|
| macOS | `.dmg` |
| Windows | `.msi` / `.exe` |
| Linux | `.AppImage` / `.deb` |

> Builds are currently **unsigned**. On macOS, right-click the app → **Open** the
> first time (or `xattr -dr com.apple.quarantine /Applications/Kablan.dev.app`).
> On Windows, choose **More info → Run anyway** on the SmartScreen prompt.

Kablan.dev runs `git` and your projects' package-manager scripts, so it expects
`git` and Node.js (npm/pnpm/yarn/bun) to be installed — the same tools you
already use for development.

## How it works

A native **Rust** backend (Axum HTTP + WebSocket) does all the git, filesystem,
and process work; a **React + Vite** frontend renders the UI. It ships as a
single **Tauri** desktop app.

```
┌─────────────── Tauri app ───────────────┐
│  WebView (React/Vite UI)                 │
│         │  http / ws (127.0.0.1)         │
│  Rust backend (Axum)                     │
│    git · scan · env · dev-server procs   │
└──────────────────────────────────────────┘
```

Config lives at `~/.kablan/config.json`; per-project UI preferences live in the
app's local storage.

## Development

```bash
npm install

# Browser dev (Node reference server on :4317, Vite UI on :5317)
npm run dev

# Desktop dev (Tauri window + native Rust backend, hot-reloaded UI)
npm run tauri:dev

# Production build (installers land in src-tauri/target/release/bundle/)
npm run tauri:build
```

### Tests

The backend has a full black-box HTTP/WebSocket test suite that runs against
**both** the Node reference server and the Rust backend, guaranteeing they behave
identically:

```bash
npm run test:server         # against the Node reference server
npm run test:server:rust    # against the compiled Rust binary
```

## Repository layout

| Path | What |
|------|------|
| `web/` | React + Vite frontend (shadcn/ui, TanStack Query) |
| `server/` | Node/Express reference backend + the test suite (`server/test/`) |
| `src-tauri/` | Rust backend (Axum) + Tauri desktop shell |
| `landing/` | Marketing / download page (deployed to GitHub Pages) |

## Configuration

Settings live in the in-app **Settings** page and persist to
`~/.kablan/config.json`:

| Setting | Default |
|---|---|
| Scanning folder | `~/Projects` |
| Search depth | `3` |
| Env files | `.env`, `.env.local`, `.env.development`, `.env.development.local` |
| Dev-command detection order | `dev`, `start`, `serve`, `develop` |
| Log lines retained per server | `2000` |
| Linear workspace | (empty) |

## License

[MIT](LICENSE) © Shaked Amar
