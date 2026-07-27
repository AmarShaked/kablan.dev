import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreateTaskForceDialog } from "./CreateTaskForceDialog.tsx";
import { api } from "../api.ts";
import type { TaskForce } from "../api.ts";

vi.mock("../api.ts");
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderDialog(overrides: Partial<Parameters<typeof CreateTaskForceDialog>[0]> = {}) {
  const qc = new QueryClient();
  const props = {
    project: "proj",
    featureId: "f1",
    open: true,
    onOpenChange: vi.fn(),
    onCreated: vi.fn(),
    ...overrides,
  };
  const { rerender } = render(
    <QueryClientProvider client={qc}>
      <CreateTaskForceDialog {...props} />
    </QueryClientProvider>,
  );
  const rerenderWith = (next: Partial<Parameters<typeof CreateTaskForceDialog>[0]>) => {
    Object.assign(props, next);
    rerender(
      <QueryClientProvider client={qc}>
        <CreateTaskForceDialog {...props} />
      </QueryClientProvider>,
    );
    return props;
  };
  return { ...props, rerenderWith };
}

const taskForce: TaskForce = {
  id: "t1",
  name: "TF One",
  branch: "feat/one",
  baseBranch: "main",
  worktreePath: "/wt/one",
  createdAt: 0,
};

describe("CreateTaskForceDialog", () => {
  beforeEach(() => {
    vi.mocked(api.factory.createTaskForce).mockReset();
    vi.mocked(api.factory.agentMessage).mockReset();
  });

  it("disables Create when the name is empty", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();
  });

  it("creates the task force with just a name, defaulting start on and no message", async () => {
    vi.mocked(api.factory.createTaskForce).mockResolvedValue(taskForce);
    const props = renderDialog();

    await userEvent.type(screen.getByLabelText(/^name/i), "TF One");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(api.factory.createTaskForce).toHaveBeenCalledWith("proj", "f1", {
      name: "TF One",
      baseBranch: undefined,
      linearTicket: undefined,
      start: true,
    });
    await vi.waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(taskForce));
    expect(api.factory.agentMessage).not.toHaveBeenCalled();
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("passes base branch and Linear ticket, and delivers the initial prompt as the agent's first message when start is on", async () => {
    vi.mocked(api.factory.createTaskForce).mockResolvedValue(taskForce);
    vi.mocked(api.factory.agentMessage).mockResolvedValue({ ok: true });
    const props = renderDialog();

    await userEvent.type(screen.getByLabelText(/^name/i), "TF One");
    await userEvent.type(screen.getByLabelText(/base branch/i), "develop");
    await userEvent.type(screen.getByLabelText(/linear ticket/i), "ENG-123");
    await userEvent.type(screen.getByLabelText(/initial prompt/i), "Please start with the tests");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(api.factory.createTaskForce).toHaveBeenCalledWith("proj", "f1", {
      name: "TF One",
      baseBranch: "develop",
      linearTicket: "ENG-123",
      start: true,
    });
    await vi.waitFor(() =>
      expect(api.factory.agentMessage).toHaveBeenCalledWith("proj", "t1", "Please start with the tests"),
    );
    expect(props.onCreated).toHaveBeenCalledWith(taskForce);
  });

  it("does not send the initial prompt when 'Start agent now' is toggled off", async () => {
    vi.mocked(api.factory.createTaskForce).mockResolvedValue(taskForce);
    renderDialog();

    await userEvent.type(screen.getByLabelText(/^name/i), "TF One");
    await userEvent.type(screen.getByLabelText(/initial prompt/i), "Please start with the tests");
    await userEvent.click(screen.getByRole("switch", { name: /start agent now/i }));
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(api.factory.createTaskForce).toHaveBeenCalledWith("proj", "f1", {
      name: "TF One",
      baseBranch: undefined,
      linearTicket: undefined,
      start: false,
    });
    await vi.waitFor(() => expect(api.factory.createTaskForce).toHaveBeenCalled());
    expect(api.factory.agentMessage).not.toHaveBeenCalled();
  });

  it("does not call onCreated or close, and shows an error toast, when the API call fails", async () => {
    vi.mocked(api.factory.createTaskForce).mockRejectedValue(new Error("boom"));
    const props = renderDialog();

    await userEvent.type(screen.getByLabelText(/^name/i), "Broken");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    await vi.waitFor(() => expect(api.factory.createTaskForce).toHaveBeenCalled());
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).toHaveBeenCalled();
  });

  it("resets the form when Cancel is clicked, so a later reopen starts empty", async () => {
    const { rerenderWith } = renderDialog();

    await userEvent.type(screen.getByLabelText(/^name/i), "Stale name");
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    rerenderWith({ open: false });
    rerenderWith({ open: true });

    expect(screen.getByLabelText(/^name/i)).toHaveValue("");
  });
});
