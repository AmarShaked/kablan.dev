import type { Feature, Branch, Worktree, AgentStatus } from "../api.ts";

export type EntityKind = "feature" | "taskForce" | "branch" | "worktree";

export interface ProjectEntity {
  kind: EntityKind;
  id: string;
  label: string;
  sublabel?: string;
  branch?: string;
  ts: number;
  featureId?: string;
  taskForceId?: string;
  worktreePath?: string;
  isCurrent?: boolean;
  dirty?: boolean;
  status?: AgentStatus;
}

export interface BuildProjectEntitiesArgs {
  features: Feature[];
  branches: Branch[];
  worktrees: Worktree[];
  workingTaskForceIds: Set<string>;
}

export interface ProjectEntities {
  features: ProjectEntity[];
  taskForces: ProjectEntity[];
  branches: ProjectEntity[];
  worktrees: ProjectEntity[];
}

/** Basename of a filesystem path, tolerant of a trailing slash. */
function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

/** Sorts by ts desc, then label asc as a stable tie-break. */
function sortEntities(list: ProjectEntity[]): ProjectEntity[] {
  return [...list].sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    return a.label.localeCompare(b.label);
  });
}

export function buildProjectEntities({
  features,
  branches,
  worktrees,
  workingTaskForceIds,
}: BuildProjectEntitiesArgs): ProjectEntities {
  const worktreeByPath = new Map(worktrees.map((w) => [w.path, w]));

  // Find, for a given worktree path, the task force (and its feature) that claims it — used
  // both to compute taskForce ts (needs the worktree's lastCommitTs) and to join worktree
  // entities back to their task force/feature for routing.
  const taskForceByWorktreePath = new Map<string, { featureId: string; taskForceId: string }>();
  for (const feature of features) {
    for (const tf of feature.taskForces) {
      taskForceByWorktreePath.set(tf.worktreePath, { featureId: feature.id, taskForceId: tf.id });
    }
  }

  const taskForceEntities: ProjectEntity[] = [];
  const featureEntities: ProjectEntity[] = [];

  for (const feature of features) {
    let featureTs = 0;
    for (const tf of feature.taskForces) {
      const matchingWorktree = worktreeByPath.get(tf.worktreePath);
      let ts = Math.max(matchingWorktree?.lastCommitTs ?? 0, tf.createdAt);
      if (workingTaskForceIds.has(tf.id)) ts = Number.MAX_SAFE_INTEGER;
      featureTs = Math.max(featureTs, ts);
      taskForceEntities.push({
        kind: "taskForce",
        id: tf.id,
        label: tf.name,
        branch: tf.branch,
        ts,
        featureId: feature.id,
        taskForceId: tf.id,
        worktreePath: tf.worktreePath,
        status: workingTaskForceIds.has(tf.id) ? "working" : undefined,
      });
    }
    featureEntities.push({
      kind: "feature",
      id: feature.id,
      label: feature.name,
      ts: featureTs,
      featureId: feature.id,
    });
  }

  const branchEntities: ProjectEntity[] = branches.map((b) => ({
    kind: "branch",
    id: b.name,
    label: b.name,
    branch: b.name,
    ts: b.lastCommitTs ?? 0,
    isCurrent: b.current,
  }));

  const worktreeEntities: ProjectEntity[] = worktrees.map((w) => {
    const joined = taskForceByWorktreePath.get(w.path);
    const isWorking = !!joined && workingTaskForceIds.has(joined.taskForceId);
    return {
      kind: "worktree",
      id: w.path,
      label: basename(w.path),
      sublabel: w.path,
      branch: w.branch ?? undefined,
      ts: w.lastCommitTs ?? 0,
      worktreePath: w.path,
      dirty: w.dirty,
      ...(joined
        ? {
            featureId: joined.featureId,
            taskForceId: joined.taskForceId,
            status: (isWorking ? "working" : undefined) as AgentStatus | undefined,
          }
        : {}),
    };
  });

  return {
    features: sortEntities(featureEntities),
    taskForces: sortEntities(taskForceEntities),
    branches: sortEntities(branchEntities),
    worktrees: sortEntities(worktreeEntities),
  };
}

/** Case-insensitive substring match over label + sublabel + branch. Empty/whitespace query
 * returns the list unchanged (no-op filter). */
export function filterEntities(list: ProjectEntity[], q: string): ProjectEntity[] {
  const query = q.trim().toLowerCase();
  if (!query) return list;
  return list.filter((e) => {
    const haystack = `${e.label} ${e.sublabel ?? ""} ${e.branch ?? ""}`.toLowerCase();
    return haystack.includes(query);
  });
}
