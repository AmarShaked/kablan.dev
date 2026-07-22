# GitLab Integration — Design

**Date:** 2026-07-22
**Status:** Approved (design), pending implementation plan
**Scope:** v1 = GitLab, desktop app only (Rust backend). Built with a clean internal
seam so a second provider (e.g. GitHub) can be added later without an up-front
abstraction.

## Goals

Surface things raw git can't, per branch/worktree, and act on them:

1. **Merge Request status** — is there an open MR for this branch? Its state
   (draft/open/merged/closed), target, approvals (best-effort), and its pipeline
   result, with a click-through to the MR.
2. **CI/CD pipeline status** — latest pipeline for a branch/commit (success /
   failed / running / …), with a link.
3. **Actions** — create a Merge Request from a branch.

## Non-goals (v1)

- Issues browsing (deferred).
- GitHub or other providers (design leaves a seam; not implemented).
- OAuth (Personal Access Token only).
- Browser dev-mode support (feature is desktop-only; see below).

## Connection & identity

- **Detection (per project):** parse the repo's `origin` remote via git.
  - SSH: `git@host:group/sub/proj.git`, `ssh://git@host:port/group/sub/proj.git`
  - HTTPS: `https://host/group/sub/proj.git` (tolerate `user@`/token in authority)
  - Result: `host` (lowercased) + `project` full path (`group/sub/proj`, `.git`
    stripped). API base = `https://<host>/api/v4`; project id = URL-encoded path
    (`group%2Fsub%2Fproj`).
- **A repo is "GitLab-connected"** iff its detected `host` is in the configured
  host list **and** a token exists for that host in the keychain. Otherwise all
  GitLab UI stays hidden — GitHub/other remotes are unaffected.
- **Per-host token** so gitlab.com and a self-hosted instance coexist.
- **Default target branch** for new MRs comes from the existing git
  `defaultBranch(dir)` helper (origin/HEAD → main/master), no extra API call.

## Desktop-only scope

The token lives in the OS keychain, which is a native-app concern. Therefore the
GitLab layer is implemented **only in the Rust backend**. In browser dev mode
(Node reference server) the GitLab endpoints don't exist and the frontend gates
all GitLab UI on `isTauri`, showing "connect in the desktop app." The existing
75-test cross-backend parity suite is unaffected.

## Backend (Rust)

New module `src-tauri/src/gitlab.rs`. New crates:

- **`keyring`** — token storage in OS keychain, service `dev.kablan.gitlab`,
  account = host. Config (`~/.kablan/config.json`) stores only `gitlabHosts:
  string[]` (hostnames, **no secrets**).
- **`ureq` + rustls** — small blocking HTTP client, called inside
  `spawn_blocking`, mirroring how git runs today. Auth header
  `PRIVATE-TOKEN: <token>`.

The token is **never** returned to the frontend, written to config, or logged.
Settings posts the PAT to the local backend (127.0.0.1), which validates + stores
it in the keychain and discards the plaintext.

### Module functions

- `resolve(dir) -> Option<{host, project}>` — from origin remote (pure parse; unit-tested).
- `token(host) -> Option<String>` — keychain lookup.
- `overview(dir) -> GitlabOverview` — open MRs + latest pipelines (see data model).
- `create_mr(dir, args) -> {iid, webUrl}`.
- `validate(host, token) -> {username}` — `GET /user`.

### GitLab API calls

- Open MRs (one call, includes each MR's pipeline):
  `GET /projects/:id/merge_requests?state=opened&per_page=100` →
  `iid, title, state, draft, web_url, source_branch, target_branch,
  head_pipeline{status, web_url}`. (Approvals are best-effort/edition-dependent;
  omit if unavailable.)
- Latest pipelines for branches without an MR:
  `GET /projects/:id/pipelines?per_page=50&order_by=updated_at` → newest per `ref`.
- Create MR: `POST /projects/:id/merge_requests` with `source_branch,
  target_branch, title, description, remove_source_branch`. **Draft** handled via
  a `Draft: ` title prefix (GitLab convention).

### Endpoints (Rust only)

- `GET /api/gitlab/hosts` → `{ hosts: string[] }`.
- `PUT /api/gitlab/token` `{ host, token }` → validates via `GET /user`, stores in
  keychain, adds host to the config list → `{ ok: true, username }` (401/blank → 400 with message).
- `DELETE /api/gitlab/token` `{ host }` → remove token + drop host from list.
- `GET /api/projects/:name/gitlab/status` → `{ connected, host, project }`.
- `GET /api/projects/:name/gitlab/overview` → `GitlabOverview` (one-shot for row
  badges; cached client-side).
- `POST /api/projects/:name/gitlab/mr` `{ sourceBranch, targetBranch, title,
  description?, draft?, removeSourceBranch? }` → `{ iid, webUrl }`.

### Data model (JSON, camelCase)

```
GitlabOverview { connected: bool, host: string|null, project: string|null,
                 mrs: MergeRequest[], pipelines: Pipeline[], error?: string }
MergeRequest   { iid, title, state, draft, webUrl, sourceBranch, targetBranch,
                 pipelineStatus: string|null,
                 approvalsRequired: number|null, approvalsLeft: number|null }
Pipeline       { ref, sha, status, webUrl }
```

## Frontend (React)

- `web/api.ts`: `gitlab.status/overview/createMr` + `gitlab.hosts/setToken/deleteToken`.
- `web/queries.ts`: `useGitlabOverview(name)` — TTL ~60s, **enabled only when
  `isTauri` and the project is connected**; manual refresh.
- **Rows:** a small **CI status dot** (green/red/amber/grey by pipeline status)
  and an **MR badge** (`!123`, plus draft/merged styling) linking to the MR —
  next to the existing remote/dirty badges. Data comes from the single cached
  `overview` (mapped to branches client-side; no per-row API calls).
- **Drawer → "GitLab" section** (Overview tab, when connected): MR state +
  target + approvals (if available) + pipeline result with links, and a
  **"Create MR"** button → small form (target = default branch, title prefilled
  from branch/last-commit subject, description, *draft* + *delete source branch*
  toggles). On success: toast with the new MR link + refresh.
- **Filter menu:** add **"Has open MR"** and **"CI failing"** toggles (chips like
  the others).
- **Graceful fallback:** with no token, MR/CI UI is hidden but action buttons can
  still open the relevant GitLab web page (deep link) in the browser.

## Settings

New **GitLab** card: add a host + paste PAT (guidance: scope **`api`** for
create-MR), **Test & save** (`GET /user`), list/remove connected hosts, and show
which host the current project maps to.

## Error handling

- No token for the host → "Connect GitLab in Settings."
- 401 (invalid/expired) / 403 / 404 (project) / network → subtle indicator + a
  clear message in the drawer's GitLab section. **No toast spam** on background
  fetches; toasts only on explicit actions (create MR, manual refresh).
- Rate limits → client cache (~60s TTL) + manual refresh.
- Self-hosted TLS via rustls with system/webpki roots.

## Testing

- **Rust tests** for `gitlab.rs` against a mock HTTP server (no real network):
  - remote-URL parser across ssh/https forms (host + project extraction),
  - MR/pipeline JSON parsing → `GitlabOverview`,
  - create-MR request shape (incl. Draft prefix),
  - error paths (401/404/network → typed errors).
- Existing 75-test parity suite remains green (GitLab endpoints are Rust-only and
  excluded from it).
- Manual verification against a real GitLab host before release.

## Security

Token only in the OS keychain; never in config, never returned to the client,
never logged. Config stores hostnames only. All API traffic is server-side (Rust).

## Future seam (not built now)

`overview`/`create_mr`/`validate` are the provider surface. A later GitHub
provider would implement the same shapes (PRs↔MRs, checks↔pipelines) behind a
per-host provider selection keyed off the detected remote host. No abstraction is
introduced until that second provider exists.
