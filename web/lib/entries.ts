import type { Branch, Worktree } from "../api.ts";
import { extractLinearId } from "../components/LinearLink.tsx";

export type Kind = "worktree" | "branch";

/** A unified row for a branch or a worktree, shared by `OverviewTab`'s list, `ItemDrawer`,
 * and the worktree cockpit's `WorktreeDetails`. Originally defined in `OverviewTab.tsx`;
 * moved here so it (and the builders below) can be reused without pulling in the whole
 * branches/worktrees list UI. */
export interface Entry {
  id: string;
  kind: Kind;
  name: string;
  head: string | null;
  current: boolean;
  isMain: boolean;
  locked: boolean;
  upstream: string | null;
  behind: number;
  branchName: string | null; // actual branch to pull (null for detached)
  author: string | null;
  ts: number | null;
  dateRel: string | null;
  cwd: string | null; // worktree dir to run in
  runBranch: string | null; // branch to check out + run (branch rows)
  inWorktree: string | null; // branch already checked out in a worktree
  remoteOnly: boolean; // branch exists only on a remote (not local yet)
  dirty: boolean; // working tree has uncommitted changes
  linearId: string | null;
  /** Base branch this entry was forked from, when known (task-force-derived entries only). */
  baseBranch?: string | null;
}

/** Relative-time label ("now", "3h", "2d", "5mo", "1y") for an entry's last-commit timestamp. */
export function relTime(ts: number | null): string {
  if (!ts) return "";
  const diff = Date.now() / 1000 - ts;
  const m = Math.floor(diff / 60);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

/** Builds an `Entry` for a worktree row. `meta` is the matching `Branch` (for upstream/behind),
 * when the worktree's branch is known locally. `currentBranch` marks the entry `current` when
 * its branch matches the repo's checked-out branch. */
export function worktreeToEntry(
  w: Worktree,
  meta: Branch | undefined,
  currentBranch: string | null,
): Entry {
  return {
    id: `wt:${w.path}`,
    kind: "worktree",
    name: w.branch ?? (w.detached ? "detached HEAD" : "—"),
    head: w.head,
    current: !!w.branch && w.branch === currentBranch,
    isMain: w.isMain,
    locked: w.locked,
    upstream: meta?.upstream ?? null,
    behind: meta?.behind ?? 0,
    branchName: w.branch,
    author: w.author,
    ts: w.lastCommitTs,
    dateRel: relTime(w.lastCommitTs),
    cwd: w.path,
    runBranch: null,
    inWorktree: null,
    remoteOnly: false,
    dirty: w.dirty,
    linearId: extractLinearId(w.branch),
  };
}

/** Builds an `Entry` for a branch row. `cwd`/`dirty` come from a matching worktree when this
 * branch is already checked out into one (null/false otherwise — a "bare" branch entry). */
export function branchToEntry(b: Branch, cwd: string | null, dirty: boolean): Entry {
  return {
    id: `br:${b.name}`,
    kind: "branch",
    name: b.name,
    head: b.lastCommit,
    current: b.current,
    isMain: false,
    locked: false,
    upstream: b.upstream,
    behind: b.behind,
    branchName: b.name,
    author: b.author,
    ts: b.lastCommitTs,
    dateRel: b.lastCommitDate ? relTime(b.lastCommitTs) : null,
    cwd,
    runBranch: b.name,
    inWorktree: cwd,
    remoteOnly: b.remoteOnly,
    dirty,
    linearId: extractLinearId(b.name),
  };
}
