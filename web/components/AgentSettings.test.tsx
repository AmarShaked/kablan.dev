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

describe("AgentSettings", () => {
  it("renders current values", () => {
    render(<AgentSettings value={base} onChange={() => {}} />);
    expect(screen.getByLabelText(/agent command/i)).toHaveValue("claude");
    expect(screen.getByLabelText(/max concurrent agents/i)).toHaveValue(4);
  });

  it("emits onChange when the agent command is edited", async () => {
    const onChange = vi.fn();
    render(<AgentSettings value={base} onChange={onChange} />);
    const input = screen.getByLabelText(/agent command/i);
    await userEvent.clear(input);
    await userEvent.type(input, "x");
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0] as FactorySettings;
    expect(last.agentCommand).toBe("x");
  });

  it("toggles stop-on-exit", async () => {
    const onChange = vi.fn();
    render(<AgentSettings value={base} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText(/stop agents on exit/i));
    expect(onChange.mock.calls.at(-1)![0].stopAgentsOnExit).toBe(false);
  });
});
