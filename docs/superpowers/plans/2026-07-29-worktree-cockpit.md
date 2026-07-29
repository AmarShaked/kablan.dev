# Worktree Cockpit + Two-Rail Sidebar — Implementation Plan

> Executed subagent-driven (superpowers:subagent-driven-development) on branch `feat/agent-factory`.
> Live `tauri dev` HMRs the frontend — keep the build GREEN and app coherent at each task.

**Goal:** Make any git worktree (and, via "Start a session", any branch) a first-class agent cockpit — chat + a rich details sidebar — and restructure the shell into a Slack-style two-rail sidebar. Retire the Branches & worktrees list/drawer.

**Architecture:** A Task Force becomes "a worktree Kablan created inside a Feature." One unified `Cockpit` (chat left, details right) serves task forces, plain worktrees, and bare branches. The agent supervisor already runs in any `cwd` with any key; a thin backend layer adds worktree-keyed agent endpoints + per-worktree session persistence. The shell becomes a narrow global rail (Inbox / Settings / Theme + avatar) + a project menu (switcher + search + Features/Worktrees/Branches) + main area.

## Global Constraints
- Frontend tests: `npm run test:web` (Vitest+RTL, `web/**`). Rust: `cargo test` in `src-tauri`. Type/build: `npx tsc --noEmit -p .` && `npm run build`.
- Agent/factory surface is Tauri-only (not in the Node reference server) → **no parity-suite impact**; still confirm `npm run test:server` + `:rust` stay green.
- No new deps. camelCase. Reuse shadcn primitives + existing components. GitLab PAT stays in the OS keychain only.
- Agent WS key convention: task force = `${project}::${taskForceId}` (unchanged); worktree = `${project}::wt:${worktreePath}`.

## API contract (shared by Task 1 backend and Task 3/4 frontend)
- `POST /api/projects/:name/worktrees` body `{ branch }` → `Worktree` (git worktree add for an existing branch).
- `POST /api/projects/:name/worktree-agent/start` body `{ worktreePath }` → `AgentView`.
- `POST /api/projects/:name/worktree-agent/message` body `{ worktreePath, text }` → `{ ok }`.
- `POST /api/projects/:name/worktree-agent/stop` body `{ worktreePath }` → `{ ok }`.
- `GET  /api/projects/:name/worktree-agent?worktreePath=<enc>` → `{ agent, events }` (reconcile-persists session id).

---

## Task 1 — Backend: worktree agents + persistence + create-worktree (Rust, TDD)
**Files:** `src-tauri/src/factory.rs`, `src-tauri/src/git.rs`, `src-tauri/src/lib.rs`.
- `factory.rs`: add `worktree_sessions: BTreeMap<String,String>` (worktree path → session id) to `ProjectFactory` (serde `#[serde(default)]`). Add `set_worktree_session(file,&project,&path,&sid)` and `get_worktree_session(file,&project,&path)->Option<String>`; unit tests (round-trip, unknown project inserts).
- `git.rs`: `add_worktree_for_branch(repo_dir,&worktree_root,&branch)->Result<Worktree,String>` running `git worktree add -- <path> <branch>` (branch already exists; use `--` separator; path = `worktree_root/slug(project?)/slug(branch)`), returning the created worktree (reuse `list_worktrees`/slugify). Test against a temp repo mirroring the create_task_force tests.
- `lib.rs`: mirror the task-force agent handlers (`start_agent`/`post_agent_*`/`get_agent`) for the worktree key. Enforce the same concurrent-agent cap. `start` looks up `get_worktree_session`, builds argv with `build_agent_argv`, `agents.start(key,cwd=worktreePath,argv,session_id)`. `get` reconcile-persists the session id via `set_worktree_session` (mirror `get_agent`). Add the 5 routes to `app()`.
**Verify:** `cargo test` green; parity suites green.

## Task 2 — Frontend API + key helper (folded into Task 3's dispatch)
- `web/api.ts`: `createWorktree(name,branch)`; `worktreeAgentStart/Message/Stop(name,worktreePath[,text])`, `getWorktreeAgent(name,worktreePath)` — same return shapes as the task-force agent calls.
- `web/lib/agentKey.ts`: `taskForceKey(project,id)` and `worktreeKey(project,path)` (= `${project}::wt:${path}`), used for `useAgentStream` keying. Unit-test.

## Task 3 — Frontend: WorktreeDetails + AgentChat + unified Cockpit (TDD)
**Files:** new `web/lib/entries.ts`, `web/components/WorktreeDetails.tsx`, `web/components/AgentChat.tsx`, `web/components/Cockpit.tsx` (+ tests); refactor `TaskForceCockpit.tsx` to delegate. Do NOT delete `OverviewTab`/`ItemDrawer` yet (Task 4 removes them) — reuse their sub-components.
- `entries.ts`: extract the `Entry` type + `branchToEntry`/`worktreeToEntry` builders from `OverviewTab` (pure; unit-test). 
- `WorktreeDetails({project, entry, dev-server props})`: inline panel (one scrolling column of cards, per mockup — not a Sheet/tabs) rendering: overview (branch/base/worktree meta + badges + `OpenMenu`), dev server (start/stop/url), commits (`useCommits`), working diff, env (`EnvTab`), GitLab (`GitlabSection`). Reuse ItemDrawer's sub-components.
- `AgentChat({project, agentKey, canChat, onStart, onMessage, onStop})`: the chat pane extracted from `TaskForceCockpit` (timeline from `agentFor(key).events`, You bubbles, thinking indicator, Choose drawer via `parseChoices`, composer). Parameterized for task force or worktree.
- `Cockpit({project, target})`, `target = {kind:'taskForce',feature,taskForce} | {kind:'worktree',worktree} | {kind:'branch',branch}`: composes `AgentChat` (left) + `WorktreeDetails` (right). For `branch` with no worktree → chat disabled + a "Start a session" button that calls `createWorktree(project,branch)` then switches to the worktree target. Breadcrumb Project › branch/taskforce.
- Refactor `TaskForceCockpit` to render `Cockpit` with a taskForce target (keep its remount `key` + test green).
**Verify:** `npm run test:web`, tsc, build green.

## Task 4 — Frontend: two-rail shell + nav wiring + retire Branches tab (TDD + review)
**Files:** `web/App.tsx` (major), new `web/components/GlobalRail.tsx` + `web/components/ProjectMenu.tsx`, adapt `web/components/SidebarRecent.tsx` (add Features group + search box), remove `OverviewTab.tsx`/`ItemDrawer.tsx` + the Branches tab from `ProjectView.tsx`, remove the top-center search bar + shadcn Sidebar shell.
- `GlobalRail`: logo tile; Inbox (unread badge) + Settings items; Theme toggle + user avatar pinned bottom. Fixed narrow width.
- `ProjectMenu`: `ProjectSwitcher` (top) + a search box (live-filters the lists AND opens ⌘K) + `SidebarRecent` (Features group expandable→task forces, Worktrees, Branches; scrolls). "View all" opens ⌘K scoped to kind. A Fetch action in the Worktrees group header.
- Main area by selection: `Cockpit` (task force / worktree / bare branch), a project-home (Features overview) as the default, `InboxView`, `SettingsPage`.
- Navigation: worktree/branch/taskforce rows → `Cockpit` target; feature row → expand inline. Retire: `OverviewTab`, `ItemDrawer`, Branches tab, top-center search bar, `SidebarProvider`/`SidebarInset`/`SidebarTrigger`.
- Update affected tests (`ProjectView`, `SidebarRecent`). Dispatch a task-review pass given the size.
**Verify:** `npm run test:web`, tsc, build green; manual coherence trace (project → worktree cockpit → back; bare branch → start session).
