import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { AgentSettings } from "./AgentSettings.tsx";
import type { FactorySettings } from "../api.ts";

const base: FactorySettings = {
  agentCommand: "claude",
  agentModel: "",
  permissionMode: "default",
  defaultBaseBranch: "",
  worktreeRoot: "",
  branchPattern: "feat/{feature}-{task}",
  maxConcurrentAgents: 4,
  stopAgentsOnExit: true,
  autoResumeAgents: false,
  notifications: { enabled: true, events: ["needsApproval", "failed"] },
};

// AgentSettings is a purely controlled component: it has no internal state,
// so a test that renders it with a static `value` prop and never updates it
// would see the DOM snap back after every keystroke/toggle (React re-renders
// with the same unchanged `value`). This harness holds the real state and
// feeds `onChange` back into `value`, the way an actual parent (SettingsPage)
// does, so the component under test is exercised the way it's meant to be used.
function Harness({
  initial,
  onChange,
}: {
  initial: FactorySettings;
  onChange?: (v: FactorySettings) => void;
}) {
  const [s, setS] = useState(initial);
  return (
    <AgentSettings
      value={s}
      onChange={(v) => {
        setS(v);
        onChange?.(v);
      }}
    />
  );
}

describe("AgentSettings", () => {
  it("renders current values", () => {
    render(<AgentSettings value={base} onChange={() => {}} />);
    expect(screen.getByLabelText(/agent command/i)).toHaveValue("claude");
    expect(screen.getByLabelText(/max concurrent agents/i)).toHaveValue(4);
  });

  it("emits onChange when the agent command is edited", async () => {
    const onChange = vi.fn();
    render(<Harness initial={base} onChange={onChange} />);
    const input = screen.getByLabelText(/agent command/i);
    await userEvent.clear(input);
    await userEvent.type(input, "x");
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0] as FactorySettings;
    expect(last.agentCommand).toBe("x");
    expect(input).toHaveValue("x");
  });

  it("toggles stop-on-exit", async () => {
    const onChange = vi.fn();
    render(<Harness initial={base} onChange={onChange} />);
    const toggle = screen.getByLabelText(/stop agents on exit/i);
    await userEvent.click(toggle);
    expect(onChange.mock.calls.at(-1)![0].stopAgentsOnExit).toBe(false);
    await userEvent.click(toggle);
    expect(onChange.mock.calls.at(-1)![0].stopAgentsOnExit).toBe(true);
  });

  it("selects a permission mode", async () => {
    const onChange = vi.fn();
    render(<Harness initial={base} onChange={onChange} />);
    const select = screen.getByLabelText(/permission mode/i);
    await userEvent.selectOptions(select, "bypassPermissions");
    expect(onChange.mock.calls.at(-1)![0].permissionMode).toBe("bypassPermissions");
    expect(select).toHaveValue("bypassPermissions");
  });

  it("adds and removes a notification event", async () => {
    const onChange = vi.fn();
    render(<Harness initial={base} onChange={onChange} />);

    // "awaitingInput" is not in base.notifications.events — checking it adds it.
    const awaitingInput = screen.getByLabelText(/awaiting input/i);
    expect(awaitingInput).not.toBeChecked();
    await userEvent.click(awaitingInput);
    expect(onChange.mock.calls.at(-1)![0].notifications.events).toContain("awaitingInput");
    expect(awaitingInput).toBeChecked();

    // "failed" is in base.notifications.events — unchecking it removes it.
    const failed = screen.getByLabelText(/^failed$/i);
    expect(failed).toBeChecked();
    await userEvent.click(failed);
    expect(onChange.mock.calls.at(-1)![0].notifications.events).not.toContain("failed");
    expect(failed).not.toBeChecked();
  });
});
