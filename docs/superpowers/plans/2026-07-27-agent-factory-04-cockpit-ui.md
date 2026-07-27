# Agent Factory — Plan 04: Cockpit UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The desktop UI for the factory: a nested sidebar (Features + Branches sections) when a project is selected, a Feature roll-up page, and a two-pane Task Force cockpit (live agent chat + assets rail) with create dialogs — consuming the `api.factory.*` endpoints and the `agent-event`/`agent-status` WebSocket messages from Plans 02–03.

**Architecture:** Add the frontend `api.factory.*` client + types (mirror `api.gitlab.*`), a `useFactory` query hook, and an **agent-stream store** (an `AgentStreamProvider` context fed by the existing App WebSocket, so the cockpit subscribes without prop-drilling). Then the UI: the sidebar content swaps to a Features/Branches view on project-select (a `‹ Projects` back button returns), a Feature page rolls up its Task Forces, and the cockpit renders the streamed transcript + reuses `GitlabSection`/`LinearLink`/dev-server controls in its assets rail. All gated on `isTauri`. TDD with Vitest + RTL (harness from Plan 01) and a mock WebSocket / mocked `api`.

**Tech Stack:** React 18 + TypeScript, TanStack Query, shadcn/ui, Vitest + @testing-library/react.

## Global Constraints

- **TDD:** failing test first, then minimal code. UI tests use RTL + `userEvent`; WS-driven behavior uses a mock socket / dispatched messages, and `api` is mocked with `vi.mock`.
- All factory UI is gated on `isTauri` (the query hooks + the sidebar sections).
- camelCase; consume the exact backend shapes: `FactoryOverview { features, orphaned }`, `Feature { id, name, taskForces }`, `TaskForce { id, name, branch, baseBranch, worktreePath, linearTicket?, createdAt, agentSessionId? }`, `AgentView { key, status, sessionId, pid, startedAt, exitCode }`, `AgentStatus = "idle"|"working"|"awaitingInput"|"done"|"failed"`. Agent key = `` `${projectName}::${taskForceId}` ``.
- WS message types consumed: `{type:"agent-status", key, agent}` and `{type:"agent-event", key, event}` (do not disturb the existing `hello`/`status`/`log` handling).
- Reuse existing components for the cockpit assets rail: `GitlabSection`, `LinearLink`, the dev-server start/URL controls, worktree/branch display. Do not duplicate them.
- **Attention scope:** Plan 04 shows a per-Task-Force status dot in the sidebar. Unread counts, Feature→Project aggregation, and the global inbox are **Plan 05** — out of scope here.
- The existing 75-test parity suite + all prior unit tests stay green. Commit per task with a `feat(factory):` prefix.

## File Structure

- `web/api.ts` — factory types + `api.factory.*` client.
- `web/api.test.ts` — extend with a factory-type check.
- `web/queries.ts` — `useFactory(name)` hook.
- `web/hooks/useAgentStream.tsx` — `AgentStreamProvider` + `useAgentStream()` (NEW).
- `web/hooks/useAgentStream.test.tsx` — reducer/hook test (NEW).
- `web/App.tsx` — feed `agent-*` WS messages into the provider; wrap the tree; add the factory view state + nested sidebar.
- `web/components/FactorySidebar.tsx` (+ test) — nested Features/Branches sections (NEW).
- `web/components/FeaturePage.tsx` (+ test) — feature roll-up (NEW).
- `web/components/TaskForceCockpit.tsx` (+ test) — 2-pane cockpit (NEW).
- `web/components/CreateTaskForceDialog.tsx`, `web/components/CreateFeatureDialog.tsx` (+ tests) — dialogs (NEW).

---

## Task 1: Factory API client + types + `useFactory` hook

**Files:** `web/api.ts`, `web/api.test.ts`, `web/queries.ts`

- [ ] **Step 1: Failing type test** — in `web/api.test.ts` add:

```ts
import type { FactoryOverview, TaskForce, AgentView, AgentStatus } from "./api.ts";
it("factory types", () => {
  expectTypeOf<FactoryOverview["features"][number]["taskForces"]>().toEqualTypeOf<TaskForce[]>();
  expectTypeOf<AgentView["status"]>().toEqualTypeOf<AgentStatus>();
  expectTypeOf<TaskForce["agentSessionId"]>().toEqualTypeOf<string | undefined>();
});
```

- [ ] **Step 2: Run → fail.** `npm run test:web -- api.test`

- [ ] **Step 3: Implement** in `web/api.ts` (types near the gitlab ones; client method on the `api` object next to `gitlab`):

```ts
export type AgentStatus = "idle" | "working" | "awaitingInput" | "done" | "failed";
export interface AgentView { key: string; status: AgentStatus; sessionId: string | null; pid: number | null; startedAt: number; exitCode: number | null; }
export interface TaskForce { id: string; name: string; branch: string; baseBranch: string; worktreePath: string; linearTicket?: string; createdAt: number; agentSessionId?: string; }
export interface Feature { id: string; name: string; taskForces: TaskForce[]; }
export interface FactoryOverview { features: Feature[]; orphaned: string[]; }
export interface CreateTaskForceArgs { name: string; baseBranch?: string; linearTicket?: string; start?: boolean; }
```

```ts
  factory: {
    list: (name: string) => req<FactoryOverview>(`/api/projects/${encodeURIComponent(name)}/factory`),
    createFeature: (name: string, featureName: string) =>
      req<Feature>(`/api/projects/${encodeURIComponent(name)}/factory/features`, { method: "POST", body: JSON.stringify({ name: featureName }) }),
    createTaskForce: (name: string, featureId: string, args: CreateTaskForceArgs) =>
      req<TaskForce>(`/api/projects/${encodeURIComponent(name)}/factory/features/${encodeURIComponent(featureId)}/taskforces`, { method: "POST", body: JSON.stringify(args) }),
    deleteTaskForce: (name: string, tid: string, removeWorktree = true) =>
      req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(name)}/factory/taskforces/${encodeURIComponent(tid)}`, { method: "DELETE", body: JSON.stringify({ removeWorktree }) }),
    agentStart: (name: string, tid: string) =>
      req<AgentView>(`/api/projects/${encodeURIComponent(name)}/factory/taskforces/${encodeURIComponent(tid)}/agent/start`, { method: "POST" }),
    agentMessage: (name: string, tid: string, text: string) =>
      req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(name)}/factory/taskforces/${encodeURIComponent(tid)}/agent/message`, { method: "POST", body: JSON.stringify({ text }) }),
    agentStop: (name: string, tid: string) =>
      req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(name)}/factory/taskforces/${encodeURIComponent(tid)}/agent/stop`, { method: "POST" }),
    getAgent: (name: string, tid: string) =>
      req<{ agent: AgentView | null; events: unknown[] }>(`/api/projects/${encodeURIComponent(name)}/factory/taskforces/${encodeURIComponent(tid)}/agent`),
  },
```

- [ ] **Step 4:** `web/queries.ts` add:

```ts
export function useFactory(name: string) {
  return useQuery({
    queryKey: ["factory", name] as const,
    queryFn: () => api.factory.list(name),
    enabled: isTauri && !!name,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 5: Verify** `npm run test:web -- api.test` pass; `npx tsc --noEmit -p .` clean. **Commit** `feat(factory): frontend factory api client + useFactory hook`.

---

## Task 2: Agent-stream store (`useAgentStream`)

**Files:** `web/hooks/useAgentStream.tsx` (new), `web/hooks/useAgentStream.test.tsx` (new)

**Interfaces:** `AgentStreamProvider` (context provider) + `useAgentStream()` returning `{ ingest(msg), agentFor(key): { status: AgentStatus | undefined; events: unknown[] } }`. `ingest` accepts a parsed WS message and updates state for `agent-status` (replace the key's `AgentView`) and `agent-event` (append to the key's capped event list); ignores other types.

- [ ] **Step 1: Failing test** (`useAgentStream.test.tsx`):

```tsx
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AgentStreamProvider, useAgentStream } from "./useAgentStream.tsx";

const wrap = ({ children }: { children: React.ReactNode }) => <AgentStreamProvider>{children}</AgentStreamProvider>;

describe("useAgentStream", () => {
  it("tracks status + events per key", () => {
    const { result } = renderHook(() => useAgentStream(), { wrapper: wrap });
    act(() => result.current.ingest({ type: "agent-status", key: "p::t1", agent: { key: "p::t1", status: "working", sessionId: null, pid: 1, startedAt: 0, exitCode: null } }));
    act(() => result.current.ingest({ type: "agent-event", key: "p::t1", event: { type: "assistant" } }));
    act(() => result.current.ingest({ type: "log", projectName: "p" })); // ignored
    const a = result.current.agentFor("p::t1");
    expect(a.status).toBe("working");
    expect(a.events).toHaveLength(1);
    expect(result.current.agentFor("nope").events).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** `useAgentStream.tsx`:

```tsx
import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { AgentView, AgentStatus } from "../api.ts";

const MAX = 5000;
type AgentSlice = { status?: AgentStatus; view?: AgentView; events: unknown[] };
type Ctx = {
  ingest: (msg: any) => void;
  agentFor: (key: string) => { status: AgentStatus | undefined; view: AgentView | undefined; events: unknown[] };
};
const AgentStreamCtx = createContext<Ctx | null>(null);

export function AgentStreamProvider({ children }: { children: React.ReactNode }) {
  const [, force] = useState(0);
  const map = useRef(new Map<string, AgentSlice>());
  const ingest = useCallback((msg: any) => {
    if (!msg || (msg.type !== "agent-status" && msg.type !== "agent-event")) return;
    const key = msg.key as string;
    const slice = map.current.get(key) ?? { events: [] };
    if (msg.type === "agent-status") { slice.view = msg.agent; slice.status = msg.agent?.status; }
    else { slice.events = [...slice.events, msg.event]; if (slice.events.length > MAX) slice.events.splice(0, slice.events.length - MAX); }
    map.current.set(key, slice);
    force((n) => n + 1);
  }, []);
  const agentFor = useCallback((key: string) => {
    const s = map.current.get(key);
    return { status: s?.status, view: s?.view, events: s?.events ?? [] };
  }, []);
  return <AgentStreamCtx.Provider value={{ ingest, agentFor }}>{children}</AgentStreamCtx.Provider>;
}

export function useAgentStream() {
  const c = useContext(AgentStreamCtx);
  if (!c) throw new Error("useAgentStream must be used within AgentStreamProvider");
  return c;
}
```

- [ ] **Step 4:** Wire in `App.tsx`: wrap the app tree in `<AgentStreamProvider>` (inside the existing providers), and in the WS `onmessage`, after the existing branches, call the provider's `ingest(msg)` for `agent-*` messages. Simplest: lift the WS `onmessage` to call a ref-held `ingest`, OR move the `agent-*` dispatch to a small child that has the context. (Implementer: pick the least-invasive wiring; a `useRef` holding `ingest` set from an effect is fine.) Verify existing App behavior unchanged.

- [ ] **Step 5: Verify** `npm run test:web -- useAgentStream` pass; tsc clean; `npm run build` ok. **Commit** `feat(factory): agent-stream store fed by the app websocket`.

---

## Task 3: Nested Factory sidebar (Features + Branches)

**Files:** `web/components/FactorySidebar.tsx` (+ test), `web/App.tsx`

**Interfaces:** `FactorySidebar({ project, onBack, onOpenFeature, onOpenTaskForce, onNewFeature })` — renders a `‹ Projects` back button, a **Features** section (each feature row expandable to its Task Forces, each Task Force with a status dot from `useAgentStream().agentFor(key).status`), a "New feature" affordance, and a **Branches & worktrees** section listing the project's branches/worktrees (reuse the existing data the app already loads for the overview — pass it in or query it). Consumes `useFactory(project)`.

- [ ] **Step 1: Failing test** (`FactorySidebar.test.tsx`): mock `../queries.ts`'s `useFactory` to return two features (one with two task forces), render inside `AgentStreamProvider`, assert both feature names render, task-force names appear under their feature, a "New feature" control exists, clicking a task force calls `onOpenTaskForce` with its id, and the back button calls `onBack`.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** `FactorySidebar.tsx` — a column with: back button; `Features` label; a list of features (collapsible, using local `useState` open-set), each showing its task forces (`StatusDot`-style dot colored by `agentFor(`${project}::${tf.id}`).status`); "New feature" button (calls `onNewFeature`); a `Branches & worktrees` label + the existing entries (accept `branches`/`worktrees` as props from App, rendered as simple rows that open the existing overview/drawer). Match the sidebar styling already in the app (reuse `StatusDot`, tailwind classes from `OverviewTab`).

- [ ] **Step 4:** In `App.tsx`, add factory view state: when a project is selected, the sidebar's project area swaps to `<FactorySidebar>` (a `sidebarMode: "projects" | "factory"` state; selecting a project sets `factory`, back sets `projects`). `onOpenFeature`/`onOpenTaskForce` set `view` to `"feature"`/`"cockpit"` + the selected ids. Keep the existing overview reachable from the Branches section.

- [ ] **Step 5: Verify** test + tsc + build. **Commit** `feat(factory): nested Features/Branches sidebar`.

---

## Task 4: Feature roll-up page

**Files:** `web/components/FeaturePage.tsx` (+ test)

**Interfaces:** `FeaturePage({ project, featureId, onOpenTaskForce })` — consumes `useFactory` + `useAgentStream`; shows the feature name, a metric strip (task forces count; and — where data is available from each TF's `GitlabSection`/overview — MRs/pipelines/tests; if not yet wired, show task-force + status counts), a Task Force list (name, branch, status dot, click → `onOpenTaskForce`), and a recent-activity stub. Keep it a roll-up of the feature's Task Forces only (no feature-level git/integration state, per the design).

- [ ] **Step 1: Failing test** — mock `useFactory` (one feature, 2 task forces), render in provider, assert the feature name, a "Task forces · 2"-style metric, both TF rows, and that clicking a row calls `onOpenTaskForce`.

- [ ] **Step 2–4:** run→fail, implement (reuse metric-card + list styles from `SettingsPage`/`ItemDrawer`), run→pass.

- [ ] **Step 5: Verify + Commit** `feat(factory): feature roll-up page`.

---

## Task 5: Task Force cockpit (2-pane)

**Files:** `web/components/TaskForceCockpit.tsx` (+ test)

**Interfaces:** `TaskForceCockpit({ project, taskForce })` where `taskForce: TaskForce`. Key = `` `${project}::${taskForce.id}` ``. Left pane: the agent chat — render the streamed transcript from `useAgentStream().agentFor(key).events` (map stream-json events to bubbles: `assistant` text, `user`/tool results, tool_use as a compact line; ignore `stream_event` partial deltas for v1 OR coalesce them — v1 may render only whole `assistant`/`result` messages), a status line from `agentFor(key).status`, Start/Stop controls (`api.factory.agentStart`/`agentStop`), and a composer that calls `api.factory.agentMessage`. Right pane (assets rail): reuse `GitlabSection` (project + branch = `taskForce.branch`), `LinearLink` (if `linearTicket`), a branch/worktree card, and the dev-server start/URL control for `taskForce.worktreePath`. On mount, if no live events, call `api.factory.getAgent` to backfill.

- [ ] **Step 1: Failing test** — `vi.mock("../api.ts")` with `factory.agentStart/agentMessage/agentStop/getAgent`; render in `AgentStreamProvider`; `ingest` a couple of `agent-event`/`agent-status` messages for the key; assert an assistant bubble renders and the status shows; type in the composer + submit → `api.factory.agentMessage` called with the text; click Start → `agentStart` called; Stop → `agentStop`.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** the cockpit. Split with the drawer/GitlabSection styles. Chat pane: iterate `events`, render by `event.type` (a small `renderEvent` helper — assistant text blocks, tool_use `✎ name`, result summary; skip `stream_event`/`system` noise except surfacing `spawn_error`/`stderr`). Composer disabled unless there's a running agent (status not `idle`/`done`/`failed`) OR always enabled (sending auto-starts? no — require Start first). Assets rail reuses existing components. Guard everything on `isTauri`.

- [ ] **Step 4: Verify** test + tsc + build. **Commit** `feat(factory): task force cockpit (chat + assets)`.

---

## Task 6: Create dialogs (Feature + Task Force)

**Files:** `web/components/CreateFeatureDialog.tsx`, `web/components/CreateTaskForceDialog.tsx` (+ tests)

**Interfaces:**
- `CreateFeatureDialog({ project, open, onOpenChange, onCreated })` — one input (name), Create → `api.factory.createFeature` → toast + `onCreated(feature)` + invalidate `["factory", project]`.
- `CreateTaskForceDialog({ project, featureId, open, onOpenChange, onCreated })` — fields: name, base branch (default empty → backend resolves), optional Linear ticket, initial prompt (maps to nothing yet — v1 sends `start:true` and the prompt is deferred, OR includes prompt only if the backend accepts it; per Plan 02/03 the create endpoint doesn't take a prompt, so v1: create with `start:true` then `agentMessage(prompt)` once started — the implementer wires this simple two-step), and a "start agent now" toggle. Create → `api.factory.createTaskForce` (+ optional start/message) → toast + `onCreated` + invalidate.

- [ ] **Step 1: Failing tests** — `vi.mock("../api.ts")`; for each dialog: render open, fill fields, click Create, assert the right `api.factory.*` call with the expected args, and `onCreated` fired. Validate empty-name disables Create.

- [ ] **Step 2–4:** run→fail, implement (shadcn `Dialog`/`Input`/`Textarea`/`Button`, `sonner` toast, `useQueryClient().invalidateQueries`), run→pass.

- [ ] **Step 5:** Wire the dialogs into `FactorySidebar` ("New feature") and `FeaturePage`/`FactorySidebar` ("New task force"). Verify + **Commit** `feat(factory): create feature + task force dialogs`.

---

## Verification (whole plan)

- `npm run test:web` → all frontend tests pass (new + existing).
- `npx tsc --noEmit -p . && npm run build` → clean.
- `npm run test:server:rust` → `# fail 0` (backend untouched; parity intact).
- Manual (desktop `npm run tauri:dev`): select a GitLab/agent project → nested sidebar shows Features + Branches; create a feature → create a task force (start agent) → the cockpit streams the agent's turns live, the composer sends a message that produces a new turn, Stop halts it; the Branches section still opens the existing overview/drawer.

## Notes / follow-ups

- **Plan 05** adds unread counts (bubbling Task Force → Feature → Project), the global inbox, and desktop notifications — this plan only shows per-Task-Force status dots.
- `stream_event` partial-delta rendering (token-by-token streaming in the chat) is optional for v1; whole-message rendering is acceptable. Revisit if the UX needs live typing.
- The cockpit's composer/Start UX and the create dialog's prompt→first-message wiring are the most likely spots for review iteration.
