import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorktreeDetails } from "./WorktreeDetails.tsx";
import type { Entry } from "../lib/entries.ts";
import { api, type RunningServer } from "../api.ts";

vi.mock("../api.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api.ts")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getEnv: vi.fn().mockResolvedValue([]),
      openIn: vi.fn().mockResolvedValue({ ok: true }),
      pullBranch: vi.fn().mockResolvedValue({ output: "Already up to date." }),
    },
  };
});

// `useDiff` is a spy so tests can assert the args it's called with (e.g. the
// `against` base branch when the "vs <base>" toggle is active) and drive its
// `refetch`. `vi.hoisted` makes the spies available inside the hoisted factory.
const { useDiffMock, refetchSpy, useGitlabOverviewMock } = vi.hoisted(() => ({
  useDiffMock: vi.fn(),
  refetchSpy: vi.fn(),
  useGitlabOverviewMock: vi.fn(),
}));

vi.mock("../queries.ts", () => ({
  useDiff: useDiffMock,
  useGitlabOverview: useGitlabOverviewMock,
  useWorktrees: () => ({ data: [], isPending: false }),
}));

beforeEach(() => {
  useDiffMock.mockReset();
  refetchSpy.mockReset();
  useDiffMock.mockReturnValue({ data: { diff: "" }, isPending: false, isFetching: false, refetch: refetchSpy });
  useGitlabOverviewMock.mockReset();
  useGitlabOverviewMock.mockReturnValue({ data: undefined, isPending: false });
});

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

  it("defaults to the uncommitted (working-tree) diff — useDiff called without `against`", () => {
    renderDetails({ view: "diff" });
    const last = useDiffMock.mock.calls.at(-1);
    expect(last?.[4]).toBeUndefined();
  });

  it("toggling to 'vs <base>' calls useDiff with the base branch as `against`", async () => {
    renderDetails({ view: "diff" });
    await userEvent.click(screen.getByRole("button", { name: /vs main/i }));
    const last = useDiffMock.mock.calls.at(-1);
    expect(last?.[4]).toBe("main");
  });

  it("Refresh button triggers the diff query's refetch", async () => {
    renderDetails({ view: "diff" });
    await userEvent.click(screen.getByRole("button", { name: /refresh diff/i }));
    expect(refetchSpy).toHaveBeenCalled();
  });

  it("renders the parsed per-file diff — file names plus colored added/removed lines", () => {
    const sample = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "index 111..222 100644",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1,3 +1,3 @@",
      " context line",
      "-old removed line",
      "+new added line",
      " trailing",
      "diff --git a/README.md b/README.md",
      "index 333..444 100644",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -1 +1 @@",
      "-docs before",
      "+docs after",
      "",
    ].join("\n");
    useDiffMock.mockReturnValue({
      data: { diff: sample },
      isPending: false,
      isFetching: false,
      refetch: refetchSpy,
    });
    renderDetails({ view: "diff" });
    // Both files' basenames render in their headers.
    expect(screen.getByText("foo.ts")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    // Added/removed line bodies render, colored via the success/destructive classes.
    const added = screen.getByText("new added line");
    expect(added).toBeInTheDocument();
    expect(added.parentElement?.className).toContain("text-success");
    const removed = screen.getByText("old removed line");
    expect(removed).toBeInTheDocument();
    expect(removed.parentElement?.className).toContain("text-destructive");
  });

  it("shows the empty-state (no viewer) when the diff string is empty", () => {
    // beforeEach already mocks an empty diff.
    renderDetails({ view: "diff" });
    expect(screen.getByText(/no uncommitted changes/i)).toBeInTheDocument();
    expect(screen.queryByText("foo.ts")).not.toBeInTheDocument();
  });

  it("shows a Pull button for a branch that tracks a remote, and pulls it on click", async () => {
    renderDetails({ entry: { ...entry, upstream: "origin/feat/one" } });
    await userEvent.click(screen.getByRole("button", { name: /^pull$/i }));
    expect(api.pullBranch).toHaveBeenCalledWith("proj", "feat/one", "/wt/one");
  });

  it("hides the Pull button when the branch has no upstream", () => {
    renderDetails({ entry: { ...entry, upstream: null } });
    expect(screen.queryByRole("button", { name: /^pull$/i })).not.toBeInTheDocument();
  });

  it("calls onStartServer when Start server is clicked (not running)", async () => {
    const props = renderDetails();
    await userEvent.click(screen.getByRole("button", { name: /start server/i }));
    expect(props.onStartServer).toHaveBeenCalled();
  });

  it("disables Start server and shows a deps hint when node_modules is missing", () => {
    const props = renderDetails({ depsMissing: true, onInstall: vi.fn() });
    expect(screen.getByRole("button", { name: /start server/i })).toBeDisabled();
    expect(screen.getByText(/dependencies not installed — run install deps first/i)).toBeInTheDocument();
    // Install deps stays enabled (it's the fix), and Start was never invoked.
    expect(screen.getByRole("button", { name: /install deps/i })).toBeEnabled();
    expect(props.onStartServer).not.toHaveBeenCalled();
  });

  it("enables Start server (no deps hint) when node_modules is present", () => {
    renderDetails({ depsMissing: false });
    expect(screen.getByRole("button", { name: /start server/i })).toBeEnabled();
    expect(screen.queryByText(/dependencies not installed/i)).not.toBeInTheDocument();
  });

  it("disables the Replace caret too when deps are missing", () => {
    const other: RunningServer = {
      projectName: "proj",
      cwd: "/wt/two",
      command: "npm run dev",
      branch: "feat/two",
      pid: 2,
      status: "running",
      startedAt: 0,
      exitCode: null,
    };
    renderDetails({ depsMissing: true, otherRunningServers: [other], onReplaceServer: vi.fn() });
    expect(screen.getByRole("button", { name: /start server/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /replace a dev server running on another branch/i }),
    ).toBeDisabled();
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

  it("shows a Replace dropdown (and calls onReplaceServer) when a server runs on another branch", async () => {
    const other: RunningServer = {
      projectName: "proj",
      cwd: "/wt/two",
      command: "npm run dev",
      branch: "feat/two",
      pid: 2,
      status: "running",
      startedAt: 0,
      exitCode: null,
    };
    const onReplaceServer = vi.fn();
    renderDetails({ otherRunningServers: [other], onReplaceServer });
    // The plain Start button is still there; a caret opens the replace menu.
    expect(screen.getByRole("button", { name: /start server/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /replace a dev server running on another branch/i }));
    await userEvent.click(await screen.findByText(/Replace: stop feat\/two/i));
    expect(onReplaceServer).toHaveBeenCalledWith("/wt/two");
  });

  it("renders only the plain Start button (no replace caret) when no other servers run", () => {
    renderDetails({ otherRunningServers: [] });
    expect(screen.getByRole("button", { name: /start server/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /replace a dev server running on another branch/i }),
    ).not.toBeInTheDocument();
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

  it("renders the GitLab section in the integrations view when connected", () => {
    useGitlabOverviewMock.mockReturnValue({
      data: { connected: true, mrs: [], pipelines: [], host: "gitlab.com", project: "acme/app", error: null },
      isPending: false,
    });
    renderDetails({ view: "integrations" });
    // The project header links out to the GitLab project.
    expect(screen.getByText("acme/app")).toBeInTheDocument();
  });

  it("shows a not-connected hint in the integrations view when GitLab is off", () => {
    useGitlabOverviewMock.mockReturnValue({ data: { connected: false }, isPending: false });
    renderDetails({ view: "integrations" });
    expect(screen.getByText(/gitlab isn't connected for this project/i)).toBeInTheDocument();
  });

  it("does NOT render the GitLab card in the details view (it moved to Integrations)", () => {
    useGitlabOverviewMock.mockReturnValue({
      data: { connected: true, mrs: [], pipelines: [], host: "gitlab.com", project: "acme/app", error: null },
      isPending: false,
    });
    renderDetails({ view: "details" });
    expect(screen.queryByText("acme/app")).not.toBeInTheDocument();
  });

  it("shows the linked Linear issue in the integrations view", () => {
    renderDetails({ entry: { ...entry, linearId: "FE-3146" }, view: "integrations", linearWorkspace: "acme" });
    const link = screen.getByRole("link", { name: /fe-3146/i });
    expect(link).toHaveAttribute("href", "https://linear.app/acme/issue/FE-3146");
  });

  it("shows a no-linked-issue hint in the integrations view without a Linear id", () => {
    renderDetails({ view: "integrations" });
    expect(screen.getByText(/no linked linear issue/i)).toBeInTheDocument();
  });
});
