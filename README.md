# Kablan

Run coding agents — Claude Code, Codex, Gemini CLI, Amp and others — against your repositories
from a board, and watch them work.

Each task gets its own git worktree and its own branch, so several agents can run at once without
standing on each other. You follow the conversation, review the diff, start the project's dev
server, and merge or open a PR when it looks right.

Kablan is a fork of [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) by Bloop AI, Apache-2.0.
See [NOTICE](NOTICE) for what this fork changes.

## Install

```bash
npx kablan
```

Nothing to install: the wrapper downloads the binary for your platform from this repository's
latest release, caches it under `~/.kablan/bin`, and runs it. Kablan opens in your browser.

Authenticate with your coding agent of choice first — Kablan drives the agent's own CLI, it does
not hold your model credentials.

## The task view

Opening a task gives you three columns:

- **left** — every task in the project, with what each one is doing right now
- **centre** — the agent's conversation, and the box you reply in
- **right** — the attempt: which attempt of how many, its branch and base, the worktree path,
  Open in IDE, the dev server, the diff totals, and the git actions

Each of those lives in exactly one place. Diffs take over the right column when you ask for them.

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (the toolchain in `rust-toolchain.toml`)
- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 8

```bash
cargo install cargo-watch
cargo install sqlx-cli --version ^0.8   # 0.9 needs a newer rustc than this repo pins
pnpm i
```

### Running it

```bash
pnpm run dev
```

Frontend on **5310**, backend on **5311**. A blank database is copied from `dev_assets_seed` on
first run.

To run the two halves separately — useful when you want the backend to survive a frontend restart:

```bash
BACKEND_PORT=5311 pnpm run frontend:dev
```

### Database

Queries are checked at compile time against the `.sqlx` cache. After changing any SQL:

```bash
pnpm run prepare-db
```

### Building

```bash
cd frontend && pnpm build     # frontend only
./local-build.sh              # binaries + npx package (macOS)
cd npx-cli && node bin/cli.js # try the packaged build
```

## Environment variables

| Variable | When | Default | What it does |
|---|---|---|---|
| `PORT` | runtime | auto | Production: server port. Dev: frontend port, backend takes `PORT+1` |
| `FRONTEND_PORT` | runtime | `5310` | Frontend dev server port |
| `BACKEND_PORT` | runtime | `5311` | Backend port in dev; also what the frontend proxies to |
| `HOST` | runtime | `127.0.0.1` | Backend host |
| `MCP_HOST` / `MCP_PORT` | runtime | follows `HOST` / `BACKEND_PORT` | Where the MCP task server connects |
| `DISABLE_WORKTREE_CLEANUP` | runtime | unset | Leave orphaned and expired worktrees alone, for debugging |
| `VK_ALLOWED_ORIGINS` | runtime | unset | Comma-separated origins allowed to call the API |
| `KABLAN_SENTRY_DSN` | runtime | unset | Crash reporting. Nothing is sent unless you set this |
| `KABLAN_LOCAL` / `KABLAN_DEBUG` | runtime | unset | npx wrapper: use local binaries / verbose output |

Analytics are removed in this fork: `posthog-js` and `@sentry/react` are aliased to no-op modules
at build time, so nothing is sent from the frontend even if new code imports them.

### Behind a reverse proxy

Set `VK_ALLOWED_ORIGINS` to the origin the browser actually uses, or the backend rejects the
requests with 403:

```bash
VK_ALLOWED_ORIGINS=https://kablan.example.com
```

### Running on a remote server

Configure **Settings → Editor Integration** with your SSH host and user, and "Open in IDE" will
produce `vscode://vscode-remote/ssh-remote+user@host/path` URLs that open your local editor
against the remote worktree. You need passwordless SSH and the Remote-SSH extension.
