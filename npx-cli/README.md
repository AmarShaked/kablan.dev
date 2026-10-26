# Kablan

Run coding agents — Claude Code, Codex, Gemini CLI, Amp and others — against your repositories
from a board, and watch them work.

Each task gets its own git worktree and its own branch, so several agents can run at once without
standing on each other. You follow the conversation, review the diff, start the project's dev
server, and merge or open a PR when it looks right.

## Run it

```bash
npx kablan
```

Nothing to install. This downloads the binary for your platform, caches it under `~/.kablan/bin`,
and opens Kablan in your browser.

| Command | What it does |
| --- | --- |
| `npx kablan` | Start Kablan and open it in your browser |
| `npx kablan --install` | Install `Kablan.app` into `~/Applications` (macOS only) |
| `npx kablan --uninstall` | Remove `Kablan.app`, and say what is left on disk |
| `npx kablan --mcp` | Run the MCP task server on stdin/stdout |
| `npx kablan --version` | Print the version of this wrapper |
| `npx kablan --help` | Print the above |

`--version` and `--help` answer from the package and exit; neither downloads anything or starts a
server. Anything else is rejected with exit code 2 rather than silently ignored — the wrapper
forwards no arguments to the server, so an argument it does not recognise would do nothing at all.

## Install it as an app (macOS)

```bash
npx kablan --install
```

Puts `Kablan.app` in `~/Applications`. Opening it starts Kablan in the background — no terminal
window — and opens your browser. Output goes to `~/Library/Logs/Kablan/kablan.log`.

Because the bundle is assembled on your machine rather than downloaded, macOS does not quarantine
it: no "unidentified developer" prompt, and nothing to notarise.

Installing stops every copy of Kablan that is already running first — a surviving process keeps
serving the version it started with, which makes an update look like it did nothing. What it
stopped is printed, and appended to `~/Library/Logs/Kablan/install.log`. A server you built
yourself is left alone.

- Update: `npx kablan@latest --install`
- Remove: `npx kablan --uninstall`

## Uninstalling, and what it leaves

`npx kablan --uninstall` removes `Kablan.app` and stops any Kablan that is running. It deletes
nothing else, and prints what is left with its size:

| Path | What it is |
| --- | --- |
| `~/.kablan/bin` | Cached binaries, one directory per version you have run. Safe to delete. |
| `~/Library/Application Support/dev.kablan.Kablan` | Your projects, tasks, settings and the database. Deleting this deletes your Kablan history. |
| `~/Library/Logs/Kablan` | Logs. Safe to delete. |

The binary cache is the one that grows: it keeps every version you have ever run, so on a machine
that has followed a few releases it is usually the largest of the three. If you are uninstalling
to reclaim disk, that is the one to delete — and deleting it costs you nothing but a download.

Linux keeps its data in `~/.local/share/kablan` (or `$XDG_DATA_HOME/kablan`), Windows in
`%APPDATA%\kablan\Kablan\data`.

## What you need

- **Node 18 or newer**, to run this wrapper.
- **A coding agent, already authenticated.** Kablan drives each agent's own CLI, so it uses the
  subscription you already have and never sees your model credentials.
- **Git.** Every attempt is a worktree on its own branch.

Platforms: macOS on Apple silicon and Intel, Linux x64, Windows x64.

## Environment

| Variable | What it does |
| --- | --- |
| `PORT` | Port to serve on. Defaults to one the OS picks. |
| `HOST` | Host to bind. Defaults to `127.0.0.1`. |
| `KABLAN_LOCAL=1` | Use binaries from `npx-cli/dist/` instead of a release, for development. |
| `KABLAN_DEBUG=1` | Verbose wrapper output. |

## MCP

```bash
npx kablan --mcp
```

Runs the MCP task server on stdio, so an agent can create and update Kablan tasks itself.

## About

Kablan is a fork of [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) by Bloop AI, used under
the Apache License 2.0. It is not affiliated with or endorsed by Bloop AI.

Source and issues: [github.com/AmarShaked/kablan.dev](https://github.com/AmarShaked/kablan.dev)
