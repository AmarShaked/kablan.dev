# Linear Inbox Remote Filters Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do **not** git commit unless the user explicitly asks.

**Goal:** Paginated Linear `issues` API with remote filters, meta catalog, TanStack Query cache + infinite scroll, and Linear-style status badges everywhere.

**Architecture:** Backend composes Linear GraphQL filters + cursors; frontend uses `useInfiniteQuery` / `useQuery` and shared `LinearStatusBadge`.

**Tech Stack:** Rust (SQLx-free Linear client), Axum, React, TanStack Query, ts-rs.

**Spec:** `docs/superpowers/specs/2026-09-08-linear-inbox-remote-filters-design.md`

## Global Constraints

- Filter by Linear **ids** (status/assignee/team), not names.
- Default issues query excludes `completed`/`canceled` types; specific `status` id skips that exclusion.
- Do not hand-edit `shared/types.ts` — use `pnpm run generate-types`.
- No commits unless user requests.

## File map

| File | Responsibility |
|------|----------------|
| `crates/services/src/services/linear.rs` | Filter builder, `list_issues`, `meta`, types |
| `crates/server/src/routes/integrations.rs` | Query params, `/issues`, `/meta` |
| `crates/server/src/bin/generate_types.rs` | Export new TS types |
| `frontend/src/lib/api.ts` | `listIssues(params)`, `meta()` |
| `frontend/src/lib/integrations/linear.ts` | Map status_type/color |
| `frontend/src/lib/integrations/linearFilters.ts` | Id-based filters + chip labels from meta |
| `frontend/src/components/integrations/LinearStatusBadge.tsx` | Status icon+label |
| `frontend/src/components/integrations/LinearFilterMenu.tsx` | Grouped statuses from meta |
| `frontend/src/components/integrations/LinearIssueDetailsPanel.tsx` | Badge in Status row |
| `frontend/src/pages/integrations/IntegrationPage.tsx` | Infinite scroll + queries |
| `frontend/src/hooks/useLinearIssues.ts` | Query hooks |

---

### Task 1: Backend filter composition + list_issues + meta

**Files:**
- Modify: `crates/services/src/services/linear.rs`
- Modify: `crates/server/src/routes/integrations.rs`
- Modify: `crates/server/src/bin/generate_types.rs`

**Produces:**
- `LinearIssueQuery { status, assignee, team, after, first }`
- `LinearPageInfo { has_next_page, end_cursor }`
- `LinearIssuesResponse { viewer, issues, page_info }`
- `LinearMetaResponse { viewer, teams, users, states }`
- `LinearIssue` gains `status_type`, `status_color` (optional strings)
- `LinearClient::list_issues(query)`, `LinearClient::meta()`

- [ ] **Step 1:** Add unit tests for `build_issue_filter` (default type exclusion; with status id no type nin; assignee me/all/unassigned; team).
- [ ] **Step 2:** Implement filter builder + GraphQL `issues` query with `pageInfo` + `state { name type color }`.
- [ ] **Step 3:** Implement `meta()` GraphQL (viewer, teams, users, workflowStates).
- [ ] **Step 4:** Wire routes: `GET /issues` with Query params; `GET /meta`.
- [ ] **Step 5:** Register types in `generate_types.rs`; run `pnpm run generate-types`.

---

### Task 2: LinearStatusBadge

**Files:**
- Create: `frontend/src/components/integrations/LinearStatusBadge.tsx`
- Create: `frontend/src/components/integrations/LinearStatusBadge.test.tsx`

- [ ] **Step 1:** Component maps `type` → SVG icon; uses `color` for tint; `size` sm/md.
- [ ] **Step 2:** Vitest for type→icon mapping (one assert per type).

---

### Task 3: Frontend API + filters + hooks

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/integrations/linear.ts`
- Modify: `frontend/src/lib/integrations/linearFilters.ts` (+ tests)
- Create: `frontend/src/hooks/useLinearIssues.ts`

- [ ] **Step 1:** `linearApi.listIssues(params)`, `linearApi.meta()`.
- [ ] **Step 2:** Filters use `status: 'all' | stateId`, `assignee: 'me'|'all'|'unassigned'|userId`, `team: 'all'|teamId`.
- [ ] **Step 3:** `useLinearMeta`, `useLinearIssuesInfinite`.

---

### Task 4: Wire inbox UI

**Files:**
- Modify: `LinearFilterMenu.tsx`, `LinearIssueDetailsPanel.tsx`, `IntegrationPage.tsx`
- Invalidate queries on connect/disconnect

- [ ] **Step 1:** Filter menu from meta, grouped statuses with badges.
- [ ] **Step 2:** List + details use `LinearStatusBadge`.
- [ ] **Step 3:** Infinite scroll sentinel; empty/error states.

---

### Task 5: Verify

- [ ] `cargo test -p services linear`
- [ ] Frontend tests for filters + badge
- [ ] `pnpm run check` (frontend) if feasible
