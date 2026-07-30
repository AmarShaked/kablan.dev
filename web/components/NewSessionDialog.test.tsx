import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NewSessionDialog } from "./NewSessionDialog.tsx";
import { api } from "../api.ts";
import type { Branch } from "../api.ts";

vi.mock("../api.ts");

function branch(overrides: Partial<Branch> = {}): Branch {
  return {
    name: "main",
    current: false,
    upstream: null,
    lastCommit: null,
    lastCommitDate: null,
    lastCommitTs: null,
    author: null,
    ahead: 0,
    behind: 0,
    remoteOnly: false,
    ...overrides,
  };
}

const branches: Branch[] = [
  branch({ name: "main", current: true }),
  branch({ name: "feature/foo" }),
];

function renderDialog(overrides: Partial<Parameters<typeof NewSessionDialog>[0]> = {}) {
  const props = {
    project: "proj",
    open: true,
    onOpenChange: vi.fn(),
    branches,
    onStarted: vi.fn(),
    ...overrides,
  };
  const { rerender } = render(<NewSessionDialog {...props} />);
  const rerenderWith = (next: Partial<Parameters<typeof NewSessionDialog>[0]>) => {
    Object.assign(props, next);
    rerender(<NewSessionDialog {...props} />);
    return props;
  };
  return { ...props, rerenderWith };
}

describe("NewSessionDialog", () => {
  beforeEach(() => {
    vi.mocked(api.factory.startSession).mockReset();
  });

  it("renders the base-branch options, defaulting to the current branch", () => {
    renderDialog();
    // The trigger shows the currently-selected value.
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("falls back to main when no branch is marked current", async () => {
    vi.mocked(api.factory.startSession).mockResolvedValue({ branch: "session/abc" });
    renderDialog({ branches: [branch({ name: "develop" })] });

    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    await vi.waitFor(() =>
      expect(api.factory.startSession).toHaveBeenCalledWith("proj", "main", {
        message: undefined,
        copyNodeModules: true,
        copyEnv: true,
      }),
    );
  });

  it("starts a session with the default base branch and trimmed message, then notifies and closes", async () => {
    vi.mocked(api.factory.startSession).mockResolvedValue({ branch: "session/abc123" });
    const props = renderDialog();

    await userEvent.type(screen.getByLabelText(/first message/i), "  do the thing  ");
    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    expect(api.factory.startSession).toHaveBeenCalledWith("proj", "main", {
      message: "do the thing",
      copyNodeModules: true,
      copyEnv: true,
    });
    await vi.waitFor(() => expect(props.onStarted).toHaveBeenCalledWith("session/abc123"));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sends undefined for an empty/whitespace-only message", async () => {
    vi.mocked(api.factory.startSession).mockResolvedValue({ branch: "session/xyz" });
    renderDialog();

    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    await vi.waitFor(() =>
      expect(api.factory.startSession).toHaveBeenCalledWith("proj", "main", {
        message: undefined,
        copyNodeModules: true,
        copyEnv: true,
      }),
    );
  });

  it("passes copyNodeModules=false when that checkbox is unchecked (copy defaults on)", async () => {
    vi.mocked(api.factory.startSession).mockResolvedValue({ branch: "session/nm" });
    renderDialog();

    await userEvent.click(screen.getByRole("checkbox", { name: /node_modules/i }));
    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    await vi.waitFor(() =>
      expect(api.factory.startSession).toHaveBeenCalledWith("proj", "main", {
        message: undefined,
        copyNodeModules: false,
        copyEnv: true,
      }),
    );
  });

  it("shows an error toast and does not close or call onStarted when the API call fails", async () => {
    vi.mocked(api.factory.startSession).mockRejectedValue(new Error("boom"));
    const props = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    await vi.waitFor(() => expect(api.factory.startSession).toHaveBeenCalled());
    expect(props.onStarted).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("resets the first-message field when reopened after Cancel", async () => {
    const { rerenderWith } = renderDialog();

    await userEvent.type(screen.getByLabelText(/first message/i), "stale");
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    rerenderWith({ open: false });
    rerenderWith({ open: true });

    expect(screen.getByLabelText(/first message/i)).toHaveValue("");
  });
});
