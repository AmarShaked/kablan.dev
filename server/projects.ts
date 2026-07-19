import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { loadConfig } from "./config.ts";
import { getCurrentBranch, getLastCommitTs, listWorktrees } from "./git.ts";

export interface ProjectSummary {
  name: string;
  path: string;
  currentBranch: string | null;
  detectedCommand: string | null;
  devCommand: string;
  hasEnv: boolean;
  packageManager: string;
  lastCommitTs: number | null;
}

function detectPackageManager(dir: string): string {
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) return "bun";
  return "npm";
}

function runScript(pm: string, script: string): string {
  if (pm === "npm") return `npm run ${script}`;
  return `${pm} ${script}`; // pnpm dev / yarn dev / bun dev
}

/** Guess the dev command from package.json scripts. */
export function detectDevCommand(dir: string): string | null {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const scripts: Record<string, string> = pkg.scripts ?? {};
    const pm = detectPackageManager(dir);
    for (const candidate of loadConfig().devScriptPriority) {
      if (scripts[candidate]) return runScript(pm, candidate);
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveDevCommand(dir: string): string {
  const cfg = loadConfig();
  const override = cfg.overrides[dir]?.devCommand;
  if (override && override.trim()) return override.trim();
  return detectDevCommand(dir) ?? "npm run dev";
}

/** Directory names we never descend into while searching for repos. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  "vendor",
]);

/**
 * Recursively find git repos under `root`, descending at most `maxDepth` levels.
 * Stops at the first `.git` on any branch, so a repo's own subfolders aren't
 * treated as separate projects. Returns absolute repo directories.
 */
function findGitRepos(root: string, maxDepth: number): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    // A folder containing .git is a repo — record it and don't descend further.
    if (existsSync(join(dir, ".git"))) {
      found.push(dir);
      return;
    }
    if (depth >= maxDepth) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      walk(join(dir, e.name), depth + 1);
    }
  };
  let rootEntries;
  try {
    rootEntries = readdirSync(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const e of rootEntries) {
    if (!e.isDirectory() && !e.isSymbolicLink()) continue;
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    walk(join(root, e.name), 1);
  }
  return found;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const cfg = loadConfig();
  const parent = cfg.parentDir;
  if (!existsSync(parent)) return [];

  const repoDirs = findGitRepos(parent, Math.max(1, cfg.maxScanDepth));

  // Enrich each repo concurrently — git calls dominate the wall time.
  const scanned = await Promise.all(
    repoDirs.map(async (dir): Promise<ProjectSummary | null> => {
      const hasPackageJson = existsSync(join(dir, "package.json"));
      if (!hasPackageJson && !cfg.showNonNodeProjects) return null;

      const detected = detectDevCommand(dir);
      const pm = detectPackageManager(dir);
      const [currentBranch, lastCommitTs] = await Promise.all([
        getCurrentBranch(dir),
        getLastCommitTs(dir),
      ]);
      // Name is the path relative to the scanning folder, so nested repos
      // (e.g. "sweet/frontend/app") stay grouped and unambiguous.
      const name = relative(parent, dir).split(sep).join("/");
      return {
        name,
        path: dir,
        currentBranch,
        detectedCommand: detected,
        devCommand: resolveDevCommand(dir),
        hasEnv: cfg.envFiles.some((f) => existsSync(join(dir, f))),
        packageManager: pm,
        lastCommitTs,
      };
    }),
  );

  const results = scanned.filter((p): p is ProjectSummary => p !== null);
  // Most recently changed first; repos with no commits sink to the bottom.
  results.sort((a, b) => {
    const ta = a.lastCommitTs ?? -Infinity;
    const tb = b.lastCommitTs ?? -Infinity;
    if (tb !== ta) return tb - ta;
    return a.name.localeCompare(b.name);
  });
  return results;
}

export interface EnvFile {
  name: string;
  exists: boolean;
  content: string;
}

export function readEnvFiles(dir: string): EnvFile[] {
  return loadConfig().envFiles.map((name) => {
    const p = join(dir, name);
    const exists = existsSync(p);
    return { name, exists, content: exists ? readFileSync(p, "utf8") : "" };
  });
}

export function writeEnvFile(dir: string, name: string, content: string): void {
  if (!loadConfig().envFiles.includes(name)) {
    throw new Error(`Refusing to write unknown env file: ${name}`);
  }
  writeFileSync(join(dir, name), content);
}

/** Resolve a project path from its (possibly nested) name, guarding against traversal. */
export function projectPathFromName(name: string): string {
  const cfg = loadConfig();
  const parent = resolve(cfg.parentDir);
  const dir = resolve(parent, name);
  // Must stay inside the scanning folder — blocks "../" escapes.
  if (dir !== parent && !dir.startsWith(parent + sep)) {
    throw new Error("Invalid project name");
  }
  return dir;
}

/**
 * Resolve a working directory for a project: the main repo, or one of its
 * worktrees. Validates cwd against the actual worktree list (worktrees can live
 * anywhere on disk), so arbitrary paths are rejected.
 */
export async function resolveWorkdir(name: string, cwd?: string): Promise<string> {
  const main = projectPathFromName(name);
  if (!cwd || resolve(cwd) === resolve(main)) return main;
  const target = resolve(cwd);
  const worktrees = await listWorktrees(main);
  const allowed = worktrees.some((w) => resolve(w.path) === target);
  if (!allowed) throw new Error("Directory is not a worktree of this project");
  return target;
}
