import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App.tsx";
import { api } from "./api.ts";
import type { Branch, ProjectSummary } from "./api.ts";

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
// project-selection/branch-navigation logic, not an end-to-end render of the whole shell
// (already covered piecemeal by each component's own test file). `Cockpit` is stubbed too: its
// own chat/details rendering is unit-tested in `Cockpit.test.tsx`; this file's job is to prove
// what *App* passes it (which project/branch) and how it navigates there.
vi.mock("./components/GlobalRail.tsx", () => ({ GlobalRail: () => null }));
vi.mock("./components/InboxView.tsx", () => ({ InboxView: () => null }));
vi.mock("./components/CommandPalette.tsx", () => ({ CommandPalette: () => null }));
vi.mock("./components/SettingsPage.tsx", () => ({ SettingsPage: () => null }));
vi.mock("./components/ProjectView.tsx", () => ({ ProjectView: () => <div data-testid="project-view" /> }));
vi.mock("./components/ProjectMenu.tsx", () => ({
  ProjectMenu: (props: { selected: string | null; onSelectProject: (name: string) => void; onOpenBranch: (name: string) => void }) => (
    <div>
      <div data-testid="selected-project">{props.selected ?? ""}</div>
      <button onClick={() => props.onSelectProject("proj")}>select-proj</button>
      <button onClick={() => props.onOpenBranch("feat/bare")}>open-branch</button>
    </div>
  ),
}));
vi.mock("./components/Cockpit.tsx", () => ({
  Cockpit: (props: { project: string; branch: string }) => (
    <div>
      <div data-testid="cockpit-project">{props.project}</div>
      <div data-testid="cockpit-branch">{props.branch}</div>
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

describe("App (branch cockpit navigation)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.listProjects).mockResolvedValue([project]);
    vi.mocked(api.getBranches).mockResolvedValue([bareBranch]);
    vi.mocked(api.getWorktrees).mockResolvedValue([]);
  });

  it("opening a branch from the sidebar renders the cockpit for that project/branch", async () => {
    renderApp();
    await selectProject();
    await userEvent.click(screen.getByText("open-branch"));

    expect(await screen.findByTestId("cockpit-project")).toHaveTextContent("proj");
    expect(screen.getByTestId("cockpit-branch")).toHaveTextContent("feat/bare");
  });

  it("shows the project home (not the cockpit) before any branch has been opened", async () => {
    renderApp();
    await selectProject();
    expect(await screen.findByTestId("project-view")).toBeInTheDocument();
    expect(screen.queryByTestId("cockpit-branch")).not.toBeInTheDocument();
  });

  it("selecting a project resets any previously open cockpit branch", async () => {
    renderApp();
    await selectProject();
    await userEvent.click(screen.getByText("open-branch"));
    expect(await screen.findByTestId("cockpit-branch")).toHaveTextContent("feat/bare");

    await selectProject();
    expect(await screen.findByTestId("project-view")).toBeInTheDocument();
    expect(screen.queryByTestId("cockpit-branch")).not.toBeInTheDocument();
  });
});

describe("App (default project auto-select)", () => {
  const projA: ProjectSummary = { ...project, name: "a", lastCommitTs: 100 };
  const projB: ProjectSummary = { ...project, name: "b", lastCommitTs: 300 };
  const projC: ProjectSummary = { ...project, name: "c", lastCommitTs: 200 };

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.getBranches).mockResolvedValue([]);
    vi.mocked(api.getWorktrees).mockResolvedValue([]);
  });

  it("auto-selects the project with the most recent activity when nothing was previously opened", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([projA, projB, projC]);
    renderApp();
    expect(await screen.findByTestId("selected-project")).toHaveTextContent("b");
  });

  it("auto-selects the last-opened project (from localStorage) over the most-recent-activity one", async () => {
    localStorage.setItem("kablan.lastProject", "a");
    vi.mocked(api.listProjects).mockResolvedValue([projA, projB, projC]);
    renderApp();
    expect(await screen.findByTestId("selected-project")).toHaveTextContent("a");
  });

  it("falls back to most-recent-activity when the stored last-opened project no longer exists", async () => {
    localStorage.setItem("kablan.lastProject", "gone");
    vi.mocked(api.listProjects).mockResolvedValue([projA, projB, projC]);
    renderApp();
    expect(await screen.findByTestId("selected-project")).toHaveTextContent("b");
  });

  it("persists the selection to localStorage when a project is selected", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([project]);
    renderApp();
    await selectProject();
    await waitFor(() => expect(localStorage.getItem("kablan.lastProject")).toBe("proj"));
  });

  it("does not auto-select anything when there are no projects", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([]);
    renderApp();
    expect(await screen.findByTestId("selected-project")).toHaveTextContent("");
  });
});
