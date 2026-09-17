# Warzone: Focus Ring for Open Task Chats

**Date:** 2026-09-15  
**Status:** Approved for planning  
**Approach:** 2 — live centre chat + compact live tiles  
**Inspiration:** [tring.chat](https://tring.chat/) (fixed slots, centre focus; adapted to Kablan task chats)

## Goal

Give operators one screen where every task that is running, waiting on them, or in review is visible at once. Clicking a tile focuses that task’s chat in the centre to read and reply, without leaving Warzone. Empty slots can start a new task.

## Current state (baseline)

- Tasks and conversations live in the local app (`ProjectTasks`, `AllTasks`).
- Conversation UI: normalized entries + follow-up composer (`NormalizedConversation`, `useFollowUpSend`, etc.).
- Attention signals already exist: `taskNeedsAttention`, `taskIsUnread`, `has_in_progress_attempt`, `TaskStatus` including `inreview` (`frontend/src/utils/taskActivity.ts`, `statusLabels.ts`).
- No multi-task “deck” or ring layout today.
- Product analytics are disabled in this fork; Warzone is a local UX feature only.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Eligibility | Running (in-progress attempt), needs-you (unseen turn / failed), and In Review |
| Tile content | Compact live chat peek (same entry stream, lighter chrome) |
| Reply | Only in the centre after focus |
| Centre chrome | Chat only — no Diffs / Details |
| Navigation | Stay on Warzone; centre swaps |
| Layout | Fixed 16 ring slots in a 5×5 grid (centre 3×3 = focus) |
| Scope | Global by default + optional per-project filter |
| Overflow | Priority fill into 16; show “+N more” |
| Empty slots | Click → create task in centre |

## Architecture

```
/warzone
  WarzonePage
    ├─ WarzoneToolbar (All projects | project chips, +N badge)
    ├─ WarzoneGrid (CSS 5×5)
    │    ├─ WarzoneTile × ≤16 (compact live entries, read-only)
    │    ├─ empty slot × (16 − filled) → create mode
    │    └─ WarzoneFocus (centre)
    │         ├─ mode=chat → conversation + follow-up composer
    │         └─ mode=create → trimmed TaskForm / create+start
    └─ slotAssignment(eligibleTasks) → stable Map<slotIndex, taskId>
```

No new backend API required for v1. Membership uses existing task list payloads + live invalidation. Per-task entry streams mount only for tasks currently in the ring (and the focused task).

```
tasks query (all / filtered)
  → filterEligible
  → sortByPriority
  → assignStableSlots (max 16)
  → tiles subscribe to entry streams
focus taskId (URL ?task=)
  → full conversation + FollowUp
```

---

## 1. Shell and routing

- New route: `/warzone` inside `NormalLayout` / legacy design scope (same shell as Tasks).
- Sidebar: link labelled **Warzone** near Tasks / projects navigation.
- Query params:
  - `task=<uuid>` — focused task (optional).
  - `project=<uuid>` — project filter (optional; omit = All projects).
- Create-from-empty uses **local UI state** (centre mode = create + reserved slot index), not a URL param. Starting the task sets `?task=` to the new id.
- Focusing a tile updates `?task=` via replace/navigate without leaving `/warzone`, and exits create mode.
- Deep link to a non-eligible task: still show it in the centre; it may not occupy a ring slot.

---

## 2. Layout

- CSS grid `5 × 5`.
- Centre cells `row 2–4, col 2–4` = focus panel.
- Remaining 16 cells = ring slots numbered **1–16 clockwise** starting top-left (tring order: 1…5 top row, then right column, bottom row right-to-left, left column bottom-to-top). Exact numbering helper is pure and unit-tested.
- Empty slots render as dashed placeholders with a clear “+” affordance.
- Focused occupied slot gets a distinct border (brand accent).

---

## 3. Eligibility, priority, and slots

### Eligible

A task is eligible when **any** of:

1. `has_in_progress_attempt` (running)
2. `taskNeedsAttention` (unseen turn while not running, or last attempt failed)
3. `status === 'inreview'`

Done / cancelled / plain todo without the above are excluded.

### Priority (for fill and “+N”)

When more than 16 eligible tasks exist after the project filter:

1. Needs-you (unseen, not running)
2. Failed attempt
3. Running
4. In Review (without the above)

Stable secondary sort: most recently updated first (or existing list order if that already encodes recency).

Show toolbar text like `3 need you · +2 more not shown` when truncated.

### Slot stability

- Persist an in-memory (session) map: `slotIndex → taskId`.
- When a task leaves eligibility, its slot becomes empty; **do not reshuffle** remaining tasks.
- New eligible tasks claim the **lowest empty** slot index.
- Creating from an empty slot: reserve that slot for the new task once it becomes eligible (running).

---

## 4. Tiles (compact live chat)

Each filled tile shows:

- Title
- Project name (especially important on All projects)
- Status / attention colour (reuse status / needs-you cues)
- Last ~N conversation entries from the live stream (tools collapsed to one line)
- No composer, no diffs, no details

Implementation notes:

- Prefer a thin read-only renderer over mounting full `VirtualizedProcessLogs` × 16.
- Pause or unmount entry subscriptions when a task leaves the ring or Warzone unmounts.
- Click → set focus (`?task=`).

---

## 5. Centre focus

### Chat mode

- Reuse existing conversation history + follow-up send for the focused task’s latest attempt/workspace.
- **Chat only** — do not mount Diffs / Details / attempt side panels on this page.
- Link out optional later (“Open full task”) — not required for v1.

### Empty focus

- If no `task` and not creating: short prompt to click a tile, or auto-focus the highest-priority needs-you task on first load (prefer auto-focus first needs-you when any exist).

### Create mode (empty slot)

- Click empty slot → centre becomes **New task**.
- Reuse existing create-task + start-attempt flow (`TaskFormDialog` / `useTaskMutations.createTask`), trimmed for Warzone (title/prompt, project, agent).
- Project default: active `?project=` filter if set; if All projects, **require** choosing a project before Start.
- On Start: create task, start attempt, set `?task=` to the new id, keep that slot reserved for it.
- Cancel / Esc: leave create mode; restore previous focus if any.

---

## 6. Interaction and keyboard

- Click tile → focus that task.
- Click empty slot → create mode (clear or keep previous `task` param per implementation convenience; UI mode is create).
- Project chip → set/clear `?project=`; refilter; if focused task no longer in filter, keep it in centre until user picks another (same as eligibility edge case).
- Keyboard v1:
  - `1`–`9`, `0` → focus slots 1–10
  - `Esc` → clear create mode, or clear focus
  - Optional follow-up: next needs-you — not required for v1

---

## 7. Edge cases

| Case | Behaviour |
|------|-----------|
| Zero eligible | Empty ring + empty state copy: “Nothing needs you right now” (empty slots still allow create) |
| Focus becomes ineligible | Keep showing in centre until user selects another task |
| Stream errors on a tile | Show muted error / last known activity line; don’t crash the grid |
| No projects yet | Create mode explains that a project is required |

---

## 8. Out of scope (v1)

- Diffs / Details / PR / merge UI inside Warzone
- Reply inside tiles
- Pages of 16 / drag-reorder slots
- Remote/cloud Warzone
- Telemetry for Warzone usage (unless product later re-enables analytics)

---

## 9. Key files (expected)

| Area | Likely touch |
|------|----------------|
| Route | `frontend/src/App.tsx` |
| Page | `frontend/src/pages/Warzone.tsx` (or `pages/warzone/`) |
| Slot math / eligibility | `frontend/src/lib/warzone/*.ts` (+ unit tests) |
| Nav | sidebar / layout nav component that lists Tasks |
| Create | reuse `TaskFormDialog` / `useTaskMutations` |
| Chat | reuse conversation + `useFollowUpSend` patterns from `ProjectTasks` |
| i18n | `frontend/src/i18n/locales/en/…` |

No SQLx migrations or shared type regen expected for v1.

---

## 10. Testing

- **Unit:** eligibility predicate; priority sort; stable slot assignment; overflow `+N`; clockwise slot index map.
- **Component:** tile click updates `task` query; project filter refilters; empty slot opens create; tiles have no composer; centre has composer in chat mode.
- **Manual:** mixed running/unread/in-review across two projects; reply in centre; create from empty slot; task leaving eligibility mid-session.

---

## Success criteria

1. From `/warzone`, an operator can see up to 16 live task peeks without alt-tabbing.
2. Clicking a tile lets them reply in the centre without opening Diffs/Details.
3. Empty slots can start a new task into that slot.
4. All-projects and per-project filter both work; overflow is obvious via “+N more”.
5. Slot positions do not shuffle when other tasks finish.
