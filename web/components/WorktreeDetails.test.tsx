import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorktreeDetails } from "./WorktreeDetails.tsx";
import type { Entry } from "../lib/entries.ts";
import type { RunningServer } from "../api.ts";

vi.mock("../api.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api.ts")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getEnv: vi.fn().mockResolvedValue([]),
      openIn: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});

vi.mock("../queries.ts", () => ({
  useDiff: () => ({ data: { diff: "" }, isPending: false }),
  useGitlabOverview: () => ({ data: undefined, isPending: false }),
  useWorktrees: () => ({ data: [], isPending: false }),
}));

const entry: Entry = {
  id: "wt:/wt/one",
  kind: "worktree",
  name: "feat/one",
  head: "abc123",
  current: false,
  isMain: false,
  locked: false,
  upstream: null,
  behind: 0,
  branchName: "feat/one",
  author: "Ada",
  ts: 100,
  dateRel: "1d",
  cwd: "/wt/one",
  runBranch: null,
  inWorktree: null,
  remoteOnly: false,
  dirty: false,
  linearId: null,
  baseBranch: "main",
};

function renderDetails(overrides: Partial<Parameters<typeof WorktreeDetails>[0]> = {}) {
  const qc = new QueryClient();
  const props = {
    project: "proj",
    entry,
    server: null as RunningServer | null,
    url: null as string | null,
    busy: false,
    onStartServer: vi.fn(),
    onStopServer: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider client={qc}>
      <WorktreeDetails {...props} />
    </QueryClientProvider>,
  );
  return props;
}

describe("WorktreeDetails", () => {
  it("renders branch meta and the base branch", async () => {
    renderDetails();
    expect(await screen.findByText("feat/one")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("/wt/one")).toBeInTheDocument();
  });

  it("calls onStartServer when Start server is clicked (not running)", async () => {
    const props = renderDetails();
    await userEvent.click(screen.getByRole("button", { name: /start server/i }));
    expect(props.onStartServer).toHaveBeenCalled();
  });

  it("calls onStopServer when Stop server is clicked (running)", async () => {
    const server: RunningServer = {
      projectName: "proj",
      cwd: "/wt/one",
      command: "npm run dev",
      branch: "feat/one",
      pid: 1,
      status: "running",
      startedAt: 0,
      exitCode: null,
    };
    const props = renderDetails({ server });
    await userEvent.click(screen.getByRole("button", { name: /stop server/i }));
    expect(props.onStopServer).toHaveBeenCalled();
  });

  it("calls onInstall when Install deps is clicked (not running)", async () => {
    const onInstall = vi.fn();
    renderDetails({ onInstall });
    await userEvent.click(screen.getByRole("button", { name: /install deps/i }));
    expect(onInstall).toHaveBeenCalled();
  });

  it("shows an install-in-progress state (and hides Start/Install) while an install command runs", () => {
    const server: RunningServer = {
      projectName: "proj",
      cwd: "/wt/one",
      command: "npm install",
      branch: "feat/one",
      pid: 1,
      status: "running",
      startedAt: 0,
      exitCode: null,
    };
    renderDetails({ server, onInstall: vi.fn() });
    expect(screen.getByText(/installing dependencies/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop install/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^install deps$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start server/i })).not.toBeInTheDocument();
  });

  it("disables the dev-server control and shows a hint for a cwd-less (bare-branch) entry", () => {
    renderDetails({ entry: { ...entry, cwd: null } });
    expect(screen.getByText(/start a session for this branch to run a dev server/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start server/i })).not.toBeInTheDocument();
  });

  it("shows the environment editor hint for a cwd-less entry in the environment view", () => {
    renderDetails({ entry: { ...entry, cwd: null }, view: "environment" });
    expect(
      screen.getByText(/start a session for this branch \(or check it out\) to edit its environment/i),
    ).toBeInTheDocument();
  });

  it("renders the given log lines in the logs view (I3: logs were orphaned by the redesign)", () => {
    renderDetails({
      view: "logs",
      logs: [
        { ts: 0, stream: "stdout", text: "server listening on :3000" },
        { ts: 1, stream: "stderr", text: "warn: something" },
      ],
    });
    expect(screen.getByText("server listening on :3000")).toBeInTheDocument();
    expect(screen.getByText("warn: something")).toBeInTheDocument();
  });

  it("shows a hint (not logs) for a cwd-less entry in the logs view", () => {
    renderDetails({ entry: { ...entry, cwd: null }, view: "logs", logs: [{ ts: 0, stream: "stdout", text: "stale" }] });
    expect(screen.getByText(/start a session for this branch to see dev-server logs/i)).toBeInTheDocument();
    expect(screen.queryByText("stale")).not.toBeInTheDocument();
  });
});
