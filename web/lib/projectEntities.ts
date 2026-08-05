import type { Branch, Worktree, Feature, FactoryOverview, AgentStatus } from "../api.ts";

/** One row in the branch-centric sidebar/palette/cockpit-nav — the single unit the whole app
 * now navigates around (a git branch, joined with its working copy, feature filing, and live
 * agent/server state). Replaces the old feature/taskForce/worktree/branch `ProjectEntity` union. */
export interface BranchEntity {
  name: string;
  /** Friendly display title from `factory.branchState[name].title`, if the user set one — shown
   * in the sidebar/cockpit in place of the raw branch name. Does NOT rename the git branch. */
  title?: string;
  /** What to render for this branch: its `title` if set, else the raw git branch `name`. `name`
   * stays the real branch name everywhere it's load-bearing (keys, openBranch, git ops). */
  displayName: string;
  /** The feature this branch is filed into, if any — a branch belongs to at most one feature
   * (enforced server-side by `file_branch`). */
  featureId?: string;
  worktreePath?: string;
  /** True once a working copy exists for this branch — either a live git worktree or a
   * persisted (but not-yet-reconciled) `branchState.worktreePath`. Gates the cockpit's chat. */
  hasWorktree: boolean;
  agentStatus?: AgentStatus;
  serverRunning: boolean;
  isCurrent: boolean;
  dirty: boolean;
  ts: number;
  /** True when this branch exists ONLY on the remote (no local ref) — from git's `Branch.remoteOnly`.
   * Used to rank locally-present branches ahead of remote-only ones in the unfiled/`all` ordering. */
  remoteOnly: boolean;
}

/** Agent statuses that mean a live/working session (mirrors HomeView's ACTIVE_STATUSES) —
 * "done"/"failed"/"idle"/undefined are not live. */
const LIVE_AGENT_STATUSES = new Set<AgentStatus>(["working", "awaitingInput"]);

/** True when an agent is actively live on this branch (working or awaiting input). */
export function isLiveAgentStatus(status?: AgentStatus): boolean {
  return status !== undefined && LIVE_AGENT_STATUSES.has(status);
}

export interface FeatureGroup {
  feature: Feature;
  branches: BranchEntity[];
  /** True when ANY member branch has a live/active agent session (working or awaiting input) —
   * drives the small "active session" dot on the feature folder header. Always populated by
   * `buildBranchEntities`; optional only so test fixtures can omit it. */
  hasActiveSession?: boolean;
}

export interface BuildBranchEntitiesArgs {
  branches: Branch[];
  worktrees: Worktree[];
  factory: FactoryOverview;
  statusFor: (branch: string) => AgentStatus | undefined;
  isServerRunning: (cwd?: string) => boolean;
  /** Dev-server start time (ms) for a working copy — counts as recent activity for sort ordering. */
  serverStartedAt?: (cwd?: string) => number | undefined;
  /** Last live-activity time (ms) for a branch (agent session start / working↔idle / dev-server
   * start-stop), so the sidebar floats a branch up on ANY recent activity, not just git commits. */
  activityAt?: (branch: string) => number | undefined;
}

export interface BranchEntities {
  featureGroups: FeatureGroup[];
  unfiled: BranchEntity[];
  all: BranchEntity[];
}

/** Sorts LOCALLY-present branches ahead of remote-only ones, each group by ts desc then name asc
 * as a stable tie-break. A locally-present branch (even with older activity) always ranks above a
 * remote-only branch — remote-only branches aren't checked out here, so they belong at the bottom. */
function sortByTsDesc(list: BranchEntity[]): BranchEntity[] {
  return [...list].sort((a, b) => {
    if (a.remoteOnly !== b.remoteOnly) return a.remoteOnly ? 1 : -1;
    if (b.ts !== a.ts) return b.ts - a.ts;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Builds the app's single list of branch entities from git truth (`branches`/`worktrees`),
 * the factory's feature filing + persisted branch state, and live agent/server status —
 * then groups them into feature folders (in `factory.features` order) plus a flat "unfiled"
 * list, both sorted by last activity (a working agent floats to the very top).
 */
export function buildBranchEntities({
  branches,
  worktrees,
  factory,
  statusFor,
  isServerRunning,
  serverStartedAt,
  activityAt,
}: BuildBranchEntitiesArgs): BranchEntities {
  // git `lastCommitTs` and factory `createdAt` are UNIX SECONDS; dev-server `startedAt` and the
  // live-activity timestamps are `Date.now()` MILLISECONDS. Normalize the ms sources to seconds
  // before combining, so the max (and SidebarRecent's relative labels) stay correct.
  const toSec = (ms?: number) => (ms ? Math.floor(ms / 1000) : 0);
  const worktreeByBranch = new Map(
    worktrees.filter((w): w is Worktree & { branch: string } => !!w.branch).map((w) => [w.branch, w]),
  );
  const featureIdByBranch = new Map<string, string>();
  for (const feature of factory.features) {
    for (const branch of feature.branches) featureIdByBranch.set(branch, feature.id);
  }

  const all: BranchEntity[] = branches.map((b) => {
    const wt = worktreeByBranch.get(b.name);
    const state = factory.branchState[b.name];
    const worktreePath = wt?.path ?? state?.worktreePath;
    const agentStatus = statusFor(b.name);
    const lastCommitTs = wt?.lastCommitTs ?? b.lastCommitTs ?? null;
    // Most-recent activity across every signal (all in SECONDS): git commit, session creation
    // (factory createdAt — already seconds), a running dev server's start, and the live per-branch
    // activity feed (chat / session / server transitions). A working agent still pins to the top.
    const activityTs = Math.max(
      lastCommitTs || 0,
      state?.createdAt || 0,
      toSec(serverStartedAt?.(worktreePath)),
      toSec(activityAt?.(b.name)),
    );
    const ts = agentStatus === "working" ? Number.MAX_SAFE_INTEGER : activityTs;
    const title = state?.title?.trim() || undefined;
    return {
      name: b.name,
      title,
      displayName: title || b.name,
      featureId: featureIdByBranch.get(b.name),
      worktreePath,
      hasWorktree: !!worktreePath,
      agentStatus,
      serverRunning: isServerRunning(worktreePath),
      isCurrent: b.current,
      dirty: wt?.dirty ?? false,
      ts,
      remoteOnly: b.remoteOnly,
    };
  });

  const byName = new Map(all.map((e) => [e.name, e]));
  // A feature's rows render in the STORED `feature.branches` order, not re-sorted by
  // activity — so a manual drag-and-drop reorder (persisted via reorderFeatureBranches)
  // sticks instead of being clobbered on the next render. The unfiled "Branches" list below
  // has no manual order to preserve, so it stays activity-sorted.
  const featureGroups: FeatureGroup[] = factory.features.map((feature) => {
    const featureBranches = feature.branches
      .map((name) => byName.get(name))
      .filter((e): e is BranchEntity => !!e);
    return {
      feature,
      branches: featureBranches,
      hasActiveSession: featureBranches.some((b) => isLiveAgentStatus(b.agentStatus)),
    };
  });
  const unfiled = sortByTsDesc(all.filter((e) => !e.featureId));

  return { featureGroups, unfiled, all: sortByTsDesc(all) };
}

/** Case-insensitive substring match over the branch name. Empty/whitespace query returns the
 * list unchanged (no-op filter) — mirrors the retired `filterEntities`, scoped to branches. */
export function filterBranchEntities(list: BranchEntity[], q: string): BranchEntity[] {
  const query = q.trim().toLowerCase();
  if (!query) return list;
  return list.filter((e) => e.name.toLowerCase().includes(query));
}
