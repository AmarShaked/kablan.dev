import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App.tsx";
import { api } from "./api.ts";
import type { Branch, ProjectSummary, Worktree } from "./api.ts";

// App connects a real WebSocket for live status/agent-stream updates; jsdom has no server to
// talk to, so stub it out with an inert no-op.
class FakeWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  close() {}
  send() {}
}
vi.stubGlobal("WebSocket", FakeWebSocket);

vi.mock("./lib/version.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/version.ts")>();
  return { ...actual, isTauri: false };
});

// App renders GlobalRail/ProjectMenu/ProjectView/InboxView/CommandPalette/SettingsPage around
// the cockpit — stub the ones not under test so these stay focused tests of AppContent's own
// target-resolution/cache-invalidation logic (I1/I2), not an end-to-end render of the whole
// shell (already covered piecemeal by each component's own test file). `Cockpit` is stubbed too:
// its own "Start a session" behavior is unit-tested in `Cockpit.test.tsx`; this file's job is to
// prove what *App* does with `onStarted` and with an unresolved target, which requires
// controlling exactly when/whether `onStarted` fires and what target kind gets rendered.
vi.mock("./components/GlobalRail.tsx", () => ({ GlobalRail: () => null }));
vi.mock("./components/InboxView.tsx", () => ({ InboxView: () => null }));
vi.mock("./components/CommandPalette.tsx", () => ({ CommandPalette: () => null }));
vi.mock("./components/SettingsPage.tsx", () => ({ SettingsPage: () => null }));
vi.mock("./components/ProjectView.tsx", () => ({ ProjectView: () => <div data-testid="project-view" /> }));
vi.mock("./components/ProjectMenu.tsx", () => ({
  ProjectMenu: (props: {
    onSelectProject: (name: string) => void;
    onOpenBranch: (name: string) => void;
  }) => (
    <div>
      <button onClick={() => props.onSelectProject("proj")}>select-proj</button>
      <button onClick={() => props.onOpenBranch("feat/bare")}>open-branch</button>
      <button onClick={() => props.onOpenBranch("feat/missing")}>open-missing-branch</button>
    </div>
  ),
}));
vi.mock("./components/Cockpit.tsx", () => ({
  Cockpit: (props: { target: { kind: string }; onStarted?: (wt: Worktree) => void }) => (
    <div>
      <div data-testid="cockpit-target-kind">{props.target.kind}</div>
      {props.target.kind === "branch" && (
        <button
          onClick={() =>
            props.onStarted?.({
              path: "/wt/new",
              branch: "feat/bare",
              head: "abc",
              bare: false,
              detached: false,
              locked: false,
              isMain: false,
              lastCommitTs: null,
              author: null,
              dirty: false,
            })
          }
        >
          start-session
        </button>
      )}
    </div>
  ),
}));

const project: ProjectSummary = {
  name: "proj",
  path: "/proj",
  currentBranch: "main",
  detectedCommand: null,
  devCommand: "",
  hasEnv: false,
  packageManager: "npm",
  lastCommitTs: null,
};

const bareBranch: Branch = {
  name: "feat/bare",
  current: false,
  upstream: null,
  lastCommit: null,
  lastCommitDate: null,
  lastCommitTs: null,
  author: null,
  ahead: 0,
  behind: 0,
  remoteOnly: false,
};

const newWorktree: Worktree = {
  path: "/wt/new",
  branch: "feat/bare",
  head: "abc",
  bare: false,
  detached: false,
  locked: false,
  isMain: false,
  lastCommitTs: null,
  author: null,
  dirty: false,
};

vi.mock("./api.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api.ts")>();
  return {
    ...actual,
    wsUrl: () => "ws://localhost/ws",
    api: {
      ...actual.api,
      listProjects: vi.fn(),
      getConfig: vi.fn().mockResolvedValue({
        linearWorkspace: "",
        factory: { notifications: { enabled: false, events: [] } },
      }),
      getBranches: vi.fn(),
      getWorktrees: vi.fn(),
      createWorktree: vi.fn(),
      inbox: vi.fn().mockResolvedValue([]),
    },
  };
});

function renderApp() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  );
}

async function selectProject() {
  await userEvent.click(await screen.findByText("select-proj"));
}

describe("App (cockpit target resolution — I1/I2)", () => {
  beforeEach(() => {
    vi.mocked(api.listProjects).mockResolvedValue([project]);
    vi.mocked(api.getBranches).mockResolvedValue([bareBranch]);
  });

  it("I1: 'Start a session' on a bare branch transitions to the worktree cockpit instead of hanging on Loading…", async () => {
    // Deliberately never returns the freshly-created worktree — simulates a slow/never-refetching
    // server so the only way the UI can pick it up is via the immediate cache seed (I1's fix),
    // not by waiting on a background refetch to eventually catch up.
    vi.mocked(api.getWorktrees).mockResolvedValue([]);
    vi.mocked(api.createWorktree).mockResolvedValue(newWorktree);

    renderApp();
    await selectProject();
    await userEvent.click(screen.getByText("open-branch"));
    expect(await screen.findByTestId("cockpit-target-kind")).toHaveTextContent("branch");

    // `Cockpit` is stubbed (its own `createWorktree` call is unit-tested in Cockpit.test.tsx) —
    // this fires `onStarted` directly with the worktree the real `api.createWorktree` would have
    // returned, to isolate what *App*'s handler does with it.
    await userEvent.click(screen.getByText("start-session"));

    // Before the fix, nothing seeded/invalidated `qk.worktrees`, so switching the target to
    // `{kind:"worktree", path}` remounted into a `resolvedCockpit` that could never find the new
    // worktree — this would sit on "Loading…" (or, post-I2, "no longer exists") forever.
    await waitFor(() => expect(screen.getByTestId("cockpit-target-kind")).toHaveTextContent("worktree"));
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.queryByText(/no longer exists/i)).not.toBeInTheDocument();
  });

  it("I2: shows 'Loading…' (not 'no longer exists') while the backing query is still pending", async () => {
    vi.mocked(api.getWorktrees).mockResolvedValue([]);
    // Never resolves during this test — branchesQuery stays pending the whole time.
    vi.mocked(api.getBranches).mockReturnValue(new Promise(() => {}));

    renderApp();
    await selectProject();
    await userEvent.click(screen.getByText("open-branch"));

    expect(await screen.findByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText(/no longer exists/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("cockpit-target-kind")).not.toBeInTheDocument();
  });

  it("I2: shows a 'no longer exists' state (not permanent Loading…) once the branch is confirmed absent", async () => {
    vi.mocked(api.getWorktrees).mockResolvedValue([]);
    // "feat/missing" never appears in the resolved branches list — settled, but absent.
    vi.mocked(api.getBranches).mockResolvedValue([bareBranch]);

    renderApp();
    await selectProject();
    await userEvent.click(screen.getByText("open-missing-branch"));

    expect(await screen.findByText(/this branch no longer exists/i)).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cockpit-target-kind")).not.toBeInTheDocument();

    // The not-found state still offers a way back to the project.
    await userEvent.click(screen.getByRole("button", { name: /back to features/i }));
    expect(await screen.findByTestId("project-view")).toBeInTheDocument();
  });
});
