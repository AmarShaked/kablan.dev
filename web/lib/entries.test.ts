import { describe, it, expect } from "vitest";
import { branchToEntry, worktreeToEntry } from "./entries.ts";
import type { Branch, Worktree } from "../api.ts";

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

function worktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/wt/main",
    branch: "main",
    head: "abc123",
    bare: false,
    detached: false,
    locked: false,
    isMain: true,
    lastCommitTs: null,
    author: null,
    dirty: false,
    ...overrides,
  };
}

describe("worktreeToEntry", () => {
  it("builds a worktree-kind entry with the worktree's branch/cwd/dirty", () => {
    const w = worktree({ path: "/wt/feat", branch: "feat/x", dirty: true });
    const e = worktreeToEntry(w, undefined, "main");
    expect(e.kind).toBe("worktree");
    expect(e.name).toBe("feat/x");
    expect(e.branchName).toBe("feat/x");
    expect(e.cwd).toBe("/wt/feat");
    expect(e.dirty).toBe(true);
    expect(e.remoteOnly).toBe(false);
  });

  it("marks current when the worktree's branch matches currentBranch", () => {
    const w = worktree({ branch: "feat/x" });
    expect(worktreeToEntry(w, undefined, "feat/x").current).toBe(true);
    expect(worktreeToEntry(w, undefined, "main").current).toBe(false);
  });

  it("pulls upstream/behind from the matching branch meta", () => {
    const w = worktree({ branch: "feat/x" });
    const meta = branch({ name: "feat/x", upstream: "origin/feat/x", behind: 3 });
    const e = worktreeToEntry(w, meta, "main");
    expect(e.upstream).toBe("origin/feat/x");
    expect(e.behind).toBe(3);
  });

  it("names a detached worktree 'detached HEAD' and a branchless/non-detached one '—'", () => {
    expect(worktreeToEntry(worktree({ branch: null, detached: true }), undefined, "main").name).toBe(
      "detached HEAD",
    );
    expect(worktreeToEntry(worktree({ branch: null, detached: false }), undefined, "main").name).toBe("—");
  });

  it("extracts a Linear id from the branch name when present", () => {
    const e = worktreeToEntry(worktree({ branch: "FE-3146-fix" }), undefined, "main");
    expect(e.linearId).toBe("FE-3146");
  });
});

describe("branchToEntry", () => {
  it("builds a branch-kind entry with no cwd/dirty for a bare branch", () => {
    const b = branch({ name: "feat/y" });
    const e = branchToEntry(b, null, false);
    expect(e.kind).toBe("branch");
    expect(e.name).toBe("feat/y");
    expect(e.branchName).toBe("feat/y");
    expect(e.cwd).toBeNull();
    expect(e.dirty).toBe(false);
    expect(e.inWorktree).toBeNull();
  });

  it("carries the matching worktree's cwd/dirty when the branch is checked out", () => {
    const b = branch({ name: "feat/y" });
    const e = branchToEntry(b, "/wt/y", true);
    expect(e.cwd).toBe("/wt/y");
    expect(e.inWorktree).toBe("/wt/y");
    expect(e.dirty).toBe(true);
  });

  it("carries current/remoteOnly straight from the branch", () => {
    const e1 = branchToEntry(branch({ name: "main", current: true }), null, false);
    expect(e1.current).toBe(true);
    const e2 = branchToEntry(branch({ name: "feat/z", remoteOnly: true }), null, false);
    expect(e2.remoteOnly).toBe(true);
  });
});
