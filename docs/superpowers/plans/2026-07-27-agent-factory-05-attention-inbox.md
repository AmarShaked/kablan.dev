# Agent Factory — Plan 05: Attention Engine + Global Inbox + Notifications

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the "mission control" loop: unread counts that bubble Task Force → Feature → Project in the sidebar, a global attention inbox listing every Task Force that needs you across all projects, and config-gated desktop notifications when an agent needs attention.

**Architecture:** Unread is tracked frontend-side in the existing `useAgentStream` store (it already sees every agent's events over the WS, keyed `${project}::${tfId}`), cleared when a Task Force's cockpit is the active view. The global inbox is backend-derived: a pure `factory::build_inbox` joins the factory store (all projects) with the live agent statuses from `agents.get_all()` and returns the Task Forces needing attention; a `GET /api/inbox` handler wires it. Desktop notifications fire from the frontend on qualifying `agent-status` transitions via the Tauri notification plugin, gated by the Plan 01 `notifications` config. Reuse everything from Plans 01–04.

**Tech Stack:** Rust (serde), React + TanStack Query, `@tauri-apps/plugin-notification` + `tauri-plugin-notification` (new, Task 6 only).

## Global Constraints

- **TDD:** failing test first. Pure logic (unread reducer, `build_inbox`, the "should-notify" decision) is unit-tested directly; UI with RTL + mock store/api.
- All attention UI is gated on `isTauri`.
- Unread is frontend-only view-state (not persisted); "needs you" status (backend inbox) = agent status `awaitingInput` or `failed`. Do NOT invent a `needsApproval` status — permission-mode trust means the runtime states are `idle`/`working`/`awaitingInput`/`done`/`failed`.
- Inbox entries + notifications key off the SAME `${project}::${tfId}` key used everywhere else.
- Desktop notifications respect `config.factory.notifications` (`enabled` + `events` list). Event names in `events`: `awaitingInput`, `failed`, `done` (map to agent-status transitions).
- Existing 75-test parity suite + all prior unit tests stay green. Commit per task with a `feat(factory):` prefix.

## File Structure

- `web/hooks/useAgentStream.tsx` (+ test) — add unread tracking + active-key + `markRead`.
- `src-tauri/src/factory.rs` (+ tests) — `InboxEntry` + pure `build_inbox`.
- `src-tauri/src/lib.rs` — `GET /api/inbox` handler + route.
- `web/api.ts` (+ test), `web/queries.ts` — `InboxEntry` type, `api.inbox()`, `useInbox()`.
- `web/components/FactorySidebar.tsx`, `web/App.tsx`, `web/components/TaskForceCockpit.tsx` — unread badges + markRead wiring.
- `web/components/InboxView.tsx` (+ test) + App "Inbox" entry — the global inbox.
- `web/hooks/useAgentNotifications.tsx` (+ test) + `src-tauri` notification plugin wiring — Task 6.

---

## Task 1: Unread tracking in `useAgentStream`

**Files:** `web/hooks/useAgentStream.tsx`, `web/hooks/useAgentStream.test.tsx`

**Interfaces:** extend the context with `unread: (key) => number`, `unreadForProject: (project) => number`, `markRead: (key) => void`, `setActiveKey: (key | null) => void`. On a stored (non-noise) `agent-event`, increment that key's unread UNLESS it equals the current active key. `markRead(key)` zeroes it. `setActiveKey(key)` sets the active key and zeroes its unread.

- [ ] **Step 1: Failing test** — extend `useAgentStream.test.tsx`:

```tsx
it("tracks unread, respects active key, and sums per project", () => {
  const { result } = renderHook(() => useAgentStream(), { wrapper: wrap });
  const ev = (key: string) => ({ type: "agent-event", key, event: { type: "assistant" } });
  act(() => result.current.ingest(ev("p::t1")));
  act(() => result.current.ingest(ev("p::t1")));
  act(() => result.current.ingest(ev("p::t2")));
  expect(result.current.unread("p::t1")).toBe(2);
  expect(result.current.unreadForProject("p")).toBe(3);
  act(() => result.current.markRead("p::t1"));
  expect(result.current.unread("p::t1")).toBe(0);
  act(() => result.current.setActiveKey("p::t2"));
  act(() => result.current.ingest(ev("p::t2"))); // active → no unread
  expect(result.current.unread("p::t2")).toBe(0);
});
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — in the provider add `unread` to each slice (or a parallel `Map<string, number>`) and an `activeKey` ref. In `ingest`, after storing a non-noise `agent-event`, `if (key !== activeKey.current) unread[key] = (unread[key] ?? 0) + 1`. `unread(key)` reads it; `unreadForProject(project)` sums entries whose key starts with `` `${project}::` ``; `markRead(key)` deletes/zeros; `setActiveKey(k)` sets the ref and zeros `k`'s unread. `force()` a rerender on unread changes.
- [ ] **Step 4: Verify + Commit** `feat(factory): unread tracking in agent-stream store`.

---

## Task 2: Backend inbox (`build_inbox` + endpoint)

**Files:** `src-tauri/src/factory.rs`, `src-tauri/src/lib.rs`

**Interfaces:** `pub struct InboxEntry { project, feature_id, feature_name, task_force_id, task_force_name, branch, status }` (camelCase serde, `status: String`); `pub fn build_inbox(file: &FactoryFile, statuses: &std::collections::BTreeMap<String, crate::agents::AgentStatus>) -> Vec<InboxEntry>` — for every Task Force whose live status (looked up by `${project}::${tf.id}`) is `AwaitingInput` or `Failed`, emit an entry. Deterministic order (project, then feature order, then task-force order).

- [ ] **Step 1: Failing test** — in `factory.rs` tests:

```rust
#[test]
fn build_inbox_lists_only_attention_statuses() {
    use crate::agents::AgentStatus;
    use std::collections::BTreeMap;
    let mut file = FactoryFile::default();
    let f = create_feature(&mut file, "acme/app", "Audit").unwrap();
    // two task forces created without git (insert directly for a pure test):
    let pf = file.projects.get_mut("acme/app").unwrap();
    let feat = pf.features.iter_mut().find(|x| x.id == f.id).unwrap();
    feat.task_forces.push(TaskForce { id: "t1".into(), name: "drawer".into(), branch: "b1".into(), base_branch: "main".into(), worktree_path: "/w1".into(), linear_ticket: None, created_at: 0, agent_session_id: None });
    feat.task_forces.push(TaskForce { id: "t2".into(), name: "export".into(), branch: "b2".into(), base_branch: "main".into(), worktree_path: "/w2".into(), linear_ticket: None, created_at: 0, agent_session_id: None });
    let mut st = BTreeMap::new();
    st.insert("acme/app::t1".to_string(), AgentStatus::AwaitingInput);
    st.insert("acme/app::t2".to_string(), AgentStatus::Working); // not attention
    let inbox = build_inbox(&file, &st);
    assert_eq!(inbox.len(), 1);
    assert_eq!(inbox[0].task_force_id, "t1");
    assert_eq!(inbox[0].feature_name, "Audit");
    assert_eq!(inbox[0].status, "awaitingInput");
}
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** `build_inbox` in `factory.rs` (import `crate::agents::AgentStatus`; serialize status via serde to get the camelCase string, or map explicitly). Add the `InboxEntry` struct.
- [ ] **Step 4: Endpoint** in `lib.rs`: route `GET /api/inbox` → handler `get_inbox(State(st))`:

```rust
async fn get_inbox(State(st): State<AppState>) -> ApiResult {
    let statuses: std::collections::BTreeMap<String, agents::AgentStatus> =
        st.agents.get_all().into_iter().map(|v| (v.key, v.status)).collect();
    let out = blocking(move || {
        let file = factory::load_file(&factory_store_path());
        factory::build_inbox(&file, &statuses)
    }).await;
    Ok(Json(serde_json::to_value(out).unwrap()))
}
```

- [ ] **Step 5: Verify** — `cargo test … factory::tests` pass; `cargo build --lib` clean; `npm run test:server:rust` → `# fail 0`. **Commit** `feat(factory): global inbox aggregation + endpoint`.

---

## Task 3: Frontend inbox client + `useInbox`

**Files:** `web/api.ts` (+ `web/api.test.ts`), `web/queries.ts`

- [ ] Add TS `InboxEntry { project, featureId, featureName, taskForceId, taskForceName, branch, status }`; `api.inbox = () => req<InboxEntry[]>("/api/inbox")`; `useInbox()` = `useQuery(["inbox"], api.inbox, { enabled: isTauri, refetchInterval: 15_000 })` (polls so it stays fresh; also invalidated by the caller on WS status changes if desired). TDD the type + a hook smoke test. **Commit** `feat(factory): frontend inbox client + useInbox`.

---

## Task 4: Unread badges in the sidebar

**Files:** `web/components/FactorySidebar.tsx` (+ test), `web/App.tsx`, `web/components/TaskForceCockpit.tsx`

- [ ] Per Task Force: an unread pill (`useAgentStream().unread(key)`) next to the status dot when `> 0`. Per feature row: sum of its task forces' unread. In `App.tsx`'s Projects list: a per-project unread badge = `unreadForProject(project.name)` (from the store, no extra query). The cockpit calls `setActiveKey(key)` on mount and `markRead(key)` (or relies on active-key) so viewing clears unread; on unmount, `setActiveKey(null)`.
- [ ] TDD: mock the store so `unread` returns counts; assert pills render on TF + feature rows; assert the cockpit calls `setActiveKey` with its key on mount. **Commit** `feat(factory): unread badges bubbling in the sidebar`.

---

## Task 5: Global Inbox view

**Files:** `web/components/InboxView.tsx` (+ test), `web/App.tsx`

- [ ] A top-level "Inbox" sidebar item (above Projects) with a total-attention badge (`useInbox().data?.length`). Clicking sets `view = "inbox"`. `InboxView` renders `useInbox()` entries as rows: a status dot/chip (awaitingInput=amber, failed=rose), the path `project › feature › taskForce`, the branch, and a "Open" action that navigates into that Task Force's cockpit (set selected project + feature + task-force ids + `view="cockpit"` — pass an `onOpen(entry)` callback from App). Empty state: "Nothing needs you right now."
- [ ] TDD: mock `useInbox` with 2 entries; assert both rows + status chips render; clicking Open calls `onOpen` with the entry. **Commit** `feat(factory): global attention inbox view`.

---

## Task 6: Desktop notifications

**Files:** `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`/`main.rs` (plugin register), `src-tauri/capabilities/*.json`, `package.json`, `web/hooks/useAgentNotifications.tsx` (+ test), `web/App.tsx`

- [ ] **Plugin:** add `tauri-plugin-notification` (Rust, behind the `app` feature like the other tauri plugins) + register it; add `@tauri-apps/plugin-notification` (JS); grant the `notification:default` capability. (Mirror how `tauri-plugin-updater`/`process` are wired.)
- [ ] **Decision logic (pure, TDD first):** `shouldNotify(prev: AgentStatus | undefined, next: AgentStatus, cfg: NotificationSettings): boolean` — true iff `cfg.enabled`, the transition is INTO a state named in `cfg.events` (map `awaitingInput`/`failed`/`done`), and `prev !== next` (only on transition, no repeats). Unit-test the truth table.
- [ ] **Hook:** `useAgentNotifications()` — subscribes to agent-status changes (via `useAgentStream`), reads `config.factory.notifications` (from `useConfig`/`api.getConfig`), and on a qualifying transition calls the Tauri notification API (`isTauri` only) with a title like `"<taskForce> needs you"` + the status. Wire it once in `App`.
- [ ] TDD `shouldNotify`; the hook's notification call is mocked in tests (spy the notify fn). **Verify** `cargo build` (default features) clean, `npm run test:web` + tsc + build clean, parity green. **Commit** `feat(factory): config-gated desktop notifications`.

## Verification (whole plan)

- All Rust + web unit tests pass; `cargo build --lib` + default-feature build clean; 75 parity green; tsc + web build clean.
- Manual (desktop): run two Task Force agents; when one finishes a turn (awaiting input) or fails, its sidebar row shows an unread pill that bubbles to the feature + project, the Inbox lists it, clicking Open lands in its cockpit and clears the unread, and (if enabled) a desktop notification fires once per transition.

## Notes / follow-ups

- Unread is view-state only (resets on app restart) — intentional for v1.
- If `useInbox` polling feels laggy, invalidate `["inbox"]` from the agent-status WS handler for instant updates (optional enhancement).
- This is the final Agent-Factory plan; after it, run the whole-branch review + `superpowers:finishing-a-development-branch` for the merge decision.
