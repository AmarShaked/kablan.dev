# Claude Dev Manager

A local dashboard to manage your Claude dev environment. Scans a parent folder for
git repos and lets you, per project:

- View **active branches** (with current/upstream markers) and **worktrees**
- **Edit `.env`** and other environment files in-app
- **Start a dev server** from the main repo, a worktree, or a specific branch
- Auto-detects the dev command from `package.json` (with a per-project override)
- **Only one dev server per project** — starting a new one stops the previous
- **Live server logs** streamed to the browser over WebSocket

- Everything is editable from the **Settings page** (gear icon): scanning folder,
  env-file list, dev-command detection order, log retention, project visibility, and
  per-project command overrides.

## Architecture

- **Backend** (`server/`) — Node + Express + `ws`. Does all the filesystem, git, and
  process work. Runs on port **4317**.
- **Frontend** (`web/`) — React + Vite + **Tailwind v4 + shadcn/ui** (dark theme).
  Runs on port **5317** in dev and proxies `/api` + `/ws` to the backend.
  shadcn components live in `web/components/ui/`; add more with
  `npx shadcn@latest add <name>`.

## Run it

```bash
npm install
npm run dev      # starts backend + frontend together
```

Then open **http://localhost:5317**.

### Production-style single process

```bash
npm run preview  # builds the frontend and serves it from the Express server (port 4317)
```

## Configuration

All settings live in the in-app **Settings page** and persist to
`~/.claude-management/config.json`:

| Setting | Default |
|---|---|
| Scanning folder | `~/Projects` |
| Search depth | `3` (finds nested repos like `sweet/frontend/app`) |
| Env files (editable list) | `.env`, `.env.local`, `.env.development`, `.env.development.local` |
| Dev-command detection order | `dev`, `start`, `serve`, `develop` |
| Log lines retained per server | `2000` |
| Show non-Node projects | on |
| Per-project command overrides | (set from a project's Branches tab) |

## Notes

- Dev servers are spawned in their own process group, so stopping one kills the
  whole tree (SIGTERM, escalating to SIGKILL after 4s).
- Starting a server from a **branch** checks that branch out in the main repo first;
  starting from a **worktree** runs in that worktree's directory (no checkout needed).
