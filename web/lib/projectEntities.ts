import type { Branch, Worktree, Feature, FactoryOverview, AgentStatus } from "../api.ts";

/** One row in the branch-centric sidebar/palette/cockpit-nav — the single unit the whole app
 * now navigates around (a git branch, joined with its working copy, feature filing, and live
 * agent/server state). Replaces the old feature/taskForce/worktree/branch `ProjectEntity` union. */
export interface BranchEntity {
  name: string;
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
}

export interface FeatureGroup {
  feature: Feature;
  branches: BranchEntity[];
}

export interface BuildBranchEntitiesArgs {
  branches: Branch[];
  worktrees: Worktree[];
  factory: FactoryOverview;
  statusFor: (branch: string) => AgentStatus | undefined;
  isServerRunning: (cwd?: string) => boolean;
}

export interface BranchEntities {
  featureGroups: FeatureGroup[];
  unfiled: BranchEntity[];
  all: BranchEntity[];
}

/** Sorts by ts desc, then name asc as a stable tie-break. */
function sortByTsDesc(list: BranchEntity[]): BranchEntity[] {
  return [...list].sort((a, b) => {
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
}: BuildBranchEntitiesArgs): BranchEntities {
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
    const ts = agentStatus === "working" ? Number.MAX_SAFE_INTEGER : lastCommitTs || state?.createdAt || 0;
    return {
      name: b.name,
      featureId: featureIdByBranch.get(b.name),
      worktreePath,
      hasWorktree: !!worktreePath,
      agentStatus,
      serverRunning: isServerRunning(worktreePath),
      isCurrent: b.current,
      dirty: wt?.dirty ?? false,
      ts,
    };
  });

  const byName = new Map(all.map((e) => [e.name, e]));
  const featureGroups: FeatureGroup[] = factory.features.map((feature) => ({
    feature,
    branches: sortByTsDesc(
      feature.branches.map((name) => byName.get(name)).filter((e): e is BranchEntity => !!e),
    ),
  }));
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
