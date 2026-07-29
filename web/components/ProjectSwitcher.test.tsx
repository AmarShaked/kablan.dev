import { useEffect } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { AgentStreamProvider, useAgentStream } from "../hooks/useAgentStream.tsx";
import { ProjectSwitcher } from "./ProjectSwitcher.tsx";
import type { ProjectSummary } from "../api.ts";

const projects: ProjectSummary[] = [
  {
    name: "alpha",
    path: "/alpha",
    currentBranch: "main",
    detectedCommand: null,
    devCommand: "",
    hasEnv: false,
    packageManager: "npm",
    lastCommitTs: null,
  },
  {
    name: "beta",
    path: "/beta",
    currentBranch: "main",
    detectedCommand: null,
    devCommand: "",
    hasEnv: false,
    packageManager: "npm",
    lastCommitTs: null,
  },
];

/** Feeds messages into the AgentStreamProvider's ingest on mount, the way the app's
 * WebSocket handler normally would — lets a test seed unread counts without a real socket. */
function Seed({ messages }: { messages: unknown[] }) {
  const { ingest } = useAgentStream();
  useEffect(() => {
    messages.forEach(ingest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function unreadEvent(key: string) {
  return {
    type: "agent-event",
    key,
    event: { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "x" }] } },
  };
}

function renderSwitcher(overrides: Partial<Parameters<typeof ProjectSwitcher>[0]> = {}, seed: unknown[] = []) {
  const props = {
    projects,
    selected: "alpha" as string | null,
    onSelect: vi.fn(),
    ...overrides,
  };
  render(
    <AgentStreamProvider>
      <Seed messages={seed} />
      <ProjectSwitcher {...props} />
    </AgentStreamProvider>,
  );
  return props;
}

describe("ProjectSwitcher", () => {
  it("shows the selected project name on the trigger", () => {
    renderSwitcher();
    expect(screen.getByRole("button", { name: /switch project/i })).toHaveTextContent("alpha");
  });

  it("lists all projects once opened", async () => {
    renderSwitcher();
    await userEvent.click(screen.getByRole("button", { name: /switch project/i }));
    const list = within(screen.getByTestId("project-switcher-list"));
    expect(list.getByText("alpha")).toBeInTheDocument();
    expect(list.getByText("beta")).toBeInTheDocument();
  });

  it("filter narrows the visible projects", async () => {
    renderSwitcher();
    await userEvent.click(screen.getByRole("button", { name: /switch project/i }));
    await userEvent.type(screen.getByPlaceholderText(/filter/i), "bet");
    const list = within(screen.getByTestId("project-switcher-list"));
    expect(list.queryByText("alpha")).not.toBeInTheDocument();
    expect(list.getByText("beta")).toBeInTheDocument();
  });

  it("calls onSelect with the project name when a project row is clicked", async () => {
    const props = renderSwitcher();
    await userEvent.click(screen.getByRole("button", { name: /switch project/i }));
    const list = within(screen.getByTestId("project-switcher-list"));
    await userEvent.click(list.getByText("beta"));
    expect(props.onSelect).toHaveBeenCalledWith("beta");
  });

  it("shows a per-project unread pill in the popover list", async () => {
    renderSwitcher({}, [unreadEvent("beta::t1"), unreadEvent("beta::t1")]);
    await userEvent.click(screen.getByRole("button", { name: /switch project/i }));
    expect(screen.getByTestId("unread-pill-switcher-beta")).toHaveTextContent("2");
  });

  it("calls onRescan when the Rescan action is clicked", async () => {
    const onRescan = vi.fn();
    renderSwitcher({ onRescan });
    await userEvent.click(screen.getByRole("button", { name: /switch project/i }));
    await userEvent.click(screen.getByRole("button", { name: /rescan/i }));
    expect(onRescan).toHaveBeenCalledTimes(1);
  });
});
