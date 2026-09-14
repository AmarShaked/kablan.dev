# Linear Inbox: Remote Filters, Pagination, Cache, Status Design

**Date:** 2026-09-08  
**Status:** Implemented  
**Approach:** A — single paginated `issues` GraphQL query with remote filters

## Goal

Make the Linear inbox scale beyond a one-shot 50-issue fetch: exclude completed workflow types by default (but fetch them when filtered), filter status / assignee / team on Linear, cache pages, infinite-scroll load more, and show Linear-style status icons everywhere status appears.

## Current state (baseline)

- Backend: `viewer.assignedIssues(first: 50)` with hardcoded `state.type nin [completed, canceled]`.
- Frontend: one mount fetch; client-side filters; status as plain text; no cache or pagination.
- Key files: `crates/services/src/services/linear.rs`, `crates/server/src/routes/integrations.rs`, `frontend/src/pages/integrations/IntegrationPage.tsx`, `frontend/src/lib/integrations/linearFilters.ts`, `LinearFilterMenu.tsx`, `LinearIssueDetailsPanel.tsx`.

## Architecture

```
LinearInbox
  ├─ useQuery(['linear','meta'])           → GET /meta
  ├─ useInfiniteQuery(['linear','issues', filters]) → GET /issues?...
  ├─ LinearFilterMenu (remote options + LinearStatusBadge)
  ├─ Issue list (IntersectionObserver → fetchNextPage)
  └─ Detail + LinearIssueDetailsPanel (LinearStatusBadge)
```

Backend owns Linear GraphQL composition. Frontend does not re-filter the issue list client-side.

---

## 1. API

### `GET /api/integrations/linear/issues`

Query params:

| Param | Values | Default behavior |
|-------|--------|------------------|
| `status` | omitted \| workflow state **name** | If omitted: exclude Linear workflow types `completed` and `canceled`. If set: filter `state: { name: { eq } }` (matches that status on every team) and do **not** apply the default type exclusion. |
| `assignee` | `me` \| `all` \| `unassigned` \| Linear user **id** | `me` maps to viewer id; `all` omits assignee filter; `unassigned` → no assignee; otherwise filter that user id. |
| `team` | omitted \| Linear team **id** | Optional team filter. |
| `after` | cursor | Optional; Linear connection cursor. |
| `first` | page size | Default **25** (max 50). |

Implementation:

- GraphQL root: `issues(first:, after:, orderBy: updatedAt, filter: …)` (not `viewer.assignedIssues`).
- Always require a valid stored API key; 401 if missing/invalid.
- Response:

```ts
{
  viewer: LinearViewer,
  issues: LinearIssue[],
  page_info: { has_next_page: boolean, end_cursor: string | null }
}
```

- Each issue includes status metadata needed for badges: at least `status` (name), plus `status_type` and `status_color` (from Linear `state { name type color }`).
- Keep existing issue fields (including comments on each node for now). If payload size becomes a problem later, lazy-load comments in a follow-up — out of scope here.

### `GET /api/integrations/linear/meta`

Returns filter options and status catalog:

```ts
{
  viewer: LinearViewer,
  teams: { id: string, name: string }[],
  users: { id: string, name: string }[],
  states: {
    id: string,
    name: string,
    type: 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled',
    color: string, // Linear hex
    team_id: string | null
  }[]
}
```

Used for filter menus and for resolving icon/color when an issue’s embedded state is incomplete.

### Connect / disconnect

Unchanged except: on disconnect, frontend invalidates `['linear']` query keys.

### Types

Extend Rust structs + regenerate `shared/types.ts` via `pnpm run generate-types`. Do not hand-edit generated types.

---

## 2. Status design

### Component: `LinearStatusBadge`

Props: `name`, `type`, `color`, optional `size: 'sm' | 'md'`.

Visual mapping (inspired by Linear workflow settings):

| `type` | Icon treatment |
|--------|----------------|
| `triage` | Orange-tinted chevron / double-chevron |
| `backlog` | Dotted circle |
| `unstarted` | Empty circle |
| `started` | Progress / arc; stroke tint from `color` |
| `completed` | Filled check; tint from `color` (often purple) |
| `canceled` | X; duplicate/slash variant when name suggests Duplicate or type canceled with slash affordance |

Fallback: grey circle if `type` missing.

### Placement

1. Issue list row meta (replace plain status text).
2. `LinearIssueDetailsPanel` Status property.
3. `LinearFilterMenu` status items — group by workflow type (Triage / Backlog / Unstarted / Started / Completed / Canceled). No “+” affordances, no issue counts.

---

## 3. Frontend cache + infinite scroll

### Queries

- **Meta:** `useQuery({ queryKey: ['linear','meta'], staleTime: 5 * 60_000 })`.
- **Issues:** `useInfiniteQuery({ queryKey: ['linear','issues', filters], staleTime: 60_000, getNextPageParam: last => last.page_info.has_next_page ? last.page_info.end_cursor : undefined })`.

Filter object in the query key uses stable values (`status` name or `all`, `assignee`, `team` id or `all`) so each filter combination caches independently. Filter chips show human-readable names from meta. Status options in the menu are **deduped by name** (Linear returns one state per team).

### Scroll

Issue list `overflow-auto` container: sentinel at bottom via `IntersectionObserver` → `fetchNextPage()` when visible and `hasNextPage`. Show a compact loading row while `isFetchingNextPage`.

### Filter UX

- Defaults: status = all open (backend exclusion), assignee = `me`, team = all.
- Changing filters resets to page 1 (new query key / remount infinite query).
- Status filter to a completed/canceled state triggers a fetch that includes those types (backend).
- Remove client-side `filterLinearIssues` as the list source of truth. Keep small label helpers if useful for chips.
- Assignee/team/status options come from `/meta`, not from the current page of issues.

### Invalidation

- Connect success / disconnect → `queryClient.invalidateQueries({ queryKey: ['linear'] })`.

---

## Error handling

- Missing/invalid Linear key → existing unauthorized path; inbox shows connect empty state.
- GraphQL/API errors → toast or inline error on the inbox; keep prior cached pages when refetch fails.
- Empty page with filters → empty state copy (“No issues match these filters”).

---

## Testing

- Rust: unit tests for filter composition (default exclusion; status=Done drops exclusion; assignee me/all/unassigned; cursor passthrough).
- Frontend: filter key stability / defaults; `LinearStatusBadge` type→icon mapping; infinite query `getNextPageParam` helper.
- Manual: open inbox → only open issues; filter Done → completed appear; scroll loads more; switch filters uses cache when revisiting.

---

## Out of scope

- Lazy-loading comments per issue.
- Webhook / realtime Linear sync.
- Creating/editing Linear statuses.
- Non-Linear providers (Jira/GitHub/Monday).

## Success criteria

1. Default load never includes completed/canceled types.
2. Filtering to those statuses fetches them from Linear.
3. Assignee supports me / all / unassigned / specific user remotely; team and status likewise.
4. Infinite scroll loads further pages; TanStack Query caches by filter set.
5. List, details, and filter menu all use `LinearStatusBadge` with type/color-aware icons.
