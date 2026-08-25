import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NewSessionDialog } from "./NewSessionDialog.tsx";
import { api } from "../api.ts";
import type { Branch } from "../api.ts";
import { selectOption, selectValue } from "../test/select.ts";

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
    onCreated: vi.fn(),
    onStartFailed: vi.fn(),
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
    // The dialog now fires startSession in the background (.then/.catch), so it must return a
    // promise by default; individual tests override with a specific resolve/reject.
    vi.mocked(api.factory.startSession).mockResolvedValue({ branch: "session/default" });
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
      expect(api.factory.startSession).toHaveBeenCalledWith(
        "proj",
        "main",
        expect.objectContaining({
          message: undefined,
          copyNodeModules: true,
          copyEnv: true,
        }),
      ),
    );
  });

  it("sends the sanitized user-entered branch name and opens its cockpit optimistically", async () => {
    const props = renderDialog();

    await userEvent.type(screen.getByLabelText(/branch name/i), "  My Feature  ");
    // Live preview mirrors the server's sanitizer.
    expect(screen.getByText(/my-feature/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /start session/i }));
    // The client decides the branch (sanitized) and both navigates and creates with that exact name.
    expect(props.onStarted).toHaveBeenCalledWith("my-feature", undefined, undefined);
    await vi.waitFor(() =>
      expect(api.factory.startSession).toHaveBeenCalledWith(
        "proj",
        "main",
        expect.objectContaining({ branch: "my-feature" }),
      ),
    );
  });

  it("generates a session/<hex> branch when the name field is left empty", async () => {
    const props = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: /start session/i }));
    // Optimistic open uses a client-generated session branch, and the same name is sent to create.
    expect(props.onStarted).toHaveBeenCalledWith(expect.stringMatching(/^session\//), undefined, undefined);
    await vi.waitFor(() => expect(api.factory.startSession).toHaveBeenCalled());
    const opts = vi.mocked(api.factory.startSession).mock.calls[0][2]!;
    expect(opts.branch).toMatch(/^session\//);
  });

  it("starts a session with the default base branch and trimmed message, then notifies and closes", async () => {
    const props = renderDialog();

    await userEvent.type(screen.getByLabelText(/first message/i), "  do the thing  ");
    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    // Opens optimistically (client branch) and closes immediately, then creates in the background.
    expect(props.onStarted).toHaveBeenCalledWith(expect.stringMatching(/^session\//), "do the thing", undefined);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    await vi.waitFor(() =>
      expect(api.factory.startSession).toHaveBeenCalledWith(
        "proj",
        "main",
        expect.objectContaining({
          message: "do the thing",
          copyNodeModules: true,
          copyEnv: true,
        }),
      ),
    );
    // The create resolved → caller is told to refresh the branch's data.
    await vi.waitFor(() => expect(props.onCreated).toHaveBeenCalled());
  });

  it("sends undefined for an empty/whitespace-only message", async () => {
    vi.mocked(api.factory.startSession).mockResolvedValue({ branch: "session/xyz" });
    renderDialog();

    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    await vi.waitFor(() =>
      expect(api.factory.startSession).toHaveBeenCalledWith(
        "proj",
        "main",
        expect.objectContaining({
          message: undefined,
          copyNodeModules: true,
          copyEnv: true,
        }),
      ),
    );
  });

  it("passes copyNodeModules=false when that checkbox is unchecked (copy defaults on)", async () => {
    vi.mocked(api.factory.startSession).mockResolvedValue({ branch: "session/nm" });
    renderDialog();

    await userEvent.click(screen.getByRole("checkbox", { name: /node_modules/i }));
    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    await vi.waitFor(() =>
      expect(api.factory.startSession).toHaveBeenCalledWith(
        "proj",
        "main",
        expect.objectContaining({
          message: undefined,
          copyNodeModules: false,
          copyEnv: true,
        }),
      ),
    );
  });

  it("defaults permission to acceptEdits and passes the chosen mode to startSession", async () => {
    vi.mocked(api.factory.startSession).mockResolvedValue({ branch: "session/perm" });
    renderDialog();

    // Defaults to Accept edits when Settings has no (usable) default.
    expect(selectValue("Permission")).toBe("Accept edits");
    await selectOption("Permission", "Bypass");
    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    await vi.waitFor(() =>
      expect(api.factory.startSession).toHaveBeenCalledWith(
        "proj",
        "main",
        expect.objectContaining({ permissionMode: "bypassPermissions" }),
      ),
    );
  });

  it("seeds permission from the configured Settings default", async () => {
    vi.mocked(api.factory.startSession).mockResolvedValue({ branch: "session/perm" });
    renderDialog({ defaultPermissionMode: "supervised" });

    expect(selectValue("Permission")).toBe("Supervised");
    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    await vi.waitFor(() =>
      expect(api.factory.startSession).toHaveBeenCalledWith(
        "proj",
        "main",
        expect.objectContaining({ permissionMode: "supervised" }),
      ),
    );
  });

  it("re-seeds permission from the configured default each time it opens", async () => {
    const { rerenderWith } = renderDialog({ defaultPermissionMode: "auto" });
    expect(selectValue("Permission")).toBe("Auto");

    // A per-session choice is dropped on close…
    await selectOption("Permission", "Bypass");
    expect(selectValue("Permission")).toBe("Bypass");
    rerenderWith({ open: false });
    rerenderWith({ open: true });
    expect(selectValue("Permission")).toBe("Auto");
  });

  it("rolls back via onStartFailed (and doesn't call onCreated) when the background create fails", async () => {
    vi.mocked(api.factory.startSession).mockRejectedValue(new Error("boom"));
    const props = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    // Optimistic: it already opened the cockpit and closed the dialog before the create resolved.
    expect(props.onStarted).toHaveBeenCalledWith(expect.stringMatching(/^session\//), undefined, undefined);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    // Then the create rejects → the caller is asked to roll back, and never told it was created.
    await vi.waitFor(() => expect(props.onStartFailed).toHaveBeenCalledWith(expect.stringMatching(/^session\//)));
    expect(props.onCreated).not.toHaveBeenCalled();
  });

  it("stages a pasted image thumbnail and passes images to startSession + onStarted", async () => {
    const props = renderDialog();

    const box = screen.getByLabelText(/first message/i);
    const file = new File([new Uint8Array([1, 2, 3, 4])], "shot.png", { type: "image/png" });
    fireEvent.paste(box, {
      clipboardData: { items: [{ kind: "file", type: "image/png", getAsFile: () => file }] },
    });
    // The staged thumbnail appears (FileReader resolves async).
    expect(await screen.findByAltText("pasted attachment")).toBeInTheDocument();

    await userEvent.type(box, "look here");
    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    await vi.waitFor(() => expect(api.factory.startSession).toHaveBeenCalled());
    const opts = vi.mocked(api.factory.startSession).mock.calls[0][2]!;
    expect(opts.message).toBe("look here");
    expect(opts.images).toHaveLength(1);
    expect(opts.images![0].mediaType).toBe("image/png");
    expect(typeof opts.images![0].data).toBe("string");
    expect(opts.images![0].data.length).toBeGreaterThan(0);

    await vi.waitFor(() => expect(props.onStarted).toHaveBeenCalled());
    const startedArgs = vi.mocked(props.onStarted).mock.calls[0];
    expect(startedArgs[0]).toMatch(/^session\//);
    expect(startedArgs[1]).toBe("look here");
    expect(startedArgs[2]).toHaveLength(1);
    expect(String(startedArgs[2]![0])).toMatch(/^data:image\/png/);
  });

  it("starts an image-only session (empty message) and still passes the image", async () => {
    const props = renderDialog();

    const box = screen.getByLabelText(/first message/i);
    const file = new File([new Uint8Array([9, 8, 7])], "only.png", { type: "image/png" });
    fireEvent.paste(box, {
      clipboardData: { items: [{ kind: "file", type: "image/png", getAsFile: () => file }] },
    });
    expect(await screen.findByAltText("pasted attachment")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    await vi.waitFor(() => expect(api.factory.startSession).toHaveBeenCalled());
    const opts = vi.mocked(api.factory.startSession).mock.calls[0][2]!;
    expect(opts.message).toBeUndefined();
    expect(opts.images).toHaveLength(1);
    await vi.waitFor(() =>
      expect(props.onStarted).toHaveBeenCalledWith(expect.stringMatching(/^session\//), undefined, [expect.any(String)]),
    );
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
