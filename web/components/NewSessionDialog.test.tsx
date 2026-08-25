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

  it("passes a user-entered branch name (trimmed) to startSession and previews the sanitized name", async () => {
    vi.mocked(api.factory.startSession).mockResolvedValue({ branch: "my-feature" });
    renderDialog();

    await userEvent.type(screen.getByLabelText(/branch name/i), "  My Feature  ");
    // Live preview mirrors the server's sanitizer.
    expect(screen.getByText(/my-feature/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /start session/i }));
    await vi.waitFor(() =>
      expect(api.factory.startSession).toHaveBeenCalledWith(
        "proj",
        "main",
        expect.objectContaining({ branch: "My Feature" }),
      ),
    );
  });

  it("omits branch when the name field is left empty (server auto-names)", async () => {
    vi.mocked(api.factory.startSession).mockResolvedValue({ branch: "session/xyz" });
    renderDialog();

    await userEvent.click(screen.getByRole("button", { name: /start session/i }));
    await vi.waitFor(() => expect(api.factory.startSession).toHaveBeenCalled());
    const opts = vi.mocked(api.factory.startSession).mock.calls[0][2]!;
    expect("branch" in opts).toBe(false);
  });

  it("starts a session with the default base branch and trimmed message, then notifies and closes", async () => {
    vi.mocked(api.factory.startSession).mockResolvedValue({ branch: "session/abc123" });
    const props = renderDialog();

    await userEvent.type(screen.getByLabelText(/first message/i), "  do the thing  ");
    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    expect(api.factory.startSession).toHaveBeenCalledWith(
      "proj",
      "main",
      expect.objectContaining({
        message: "do the thing",
        copyNodeModules: true,
        copyEnv: true,
      }),
    );
    await vi.waitFor(() => expect(props.onStarted).toHaveBeenCalledWith("session/abc123", "do the thing"));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
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

  it("shows an error toast and does not close or call onStarted when the API call fails", async () => {
    vi.mocked(api.factory.startSession).mockRejectedValue(new Error("boom"));
    const props = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    await vi.waitFor(() => expect(api.factory.startSession).toHaveBeenCalled());
    expect(props.onStarted).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("stages a pasted image thumbnail and passes images to startSession + onStarted", async () => {
    vi.mocked(api.factory.startSession).mockResolvedValue({ branch: "session/img" });
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
    expect(startedArgs[0]).toBe("session/img");
    expect(startedArgs[1]).toBe("look here");
    expect(startedArgs[2]).toHaveLength(1);
    expect(String(startedArgs[2]![0])).toMatch(/^data:image\/png/);
  });

  it("starts an image-only session (empty message) and still passes the image", async () => {
    vi.mocked(api.factory.startSession).mockResolvedValue({ branch: "session/only" });
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
    await vi.waitFor(() => expect(props.onStarted).toHaveBeenCalledWith("session/only", undefined, [expect.any(String)]));
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
