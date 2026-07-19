import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

export interface Branch {
  name: string;
  current: boolean;
  upstream: string | null;
  lastCommit: string | null;
  lastCommitDate: string | null;
}

export interface Worktree {
  path: string;
  branch: string | null;
  head: string | null;
  bare: boolean;
  detached: boolean;
  locked: boolean;
  /** True when this worktree is the project's main working directory. */
  isMain: boolean;
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const out = await git(dir, ["rev-parse", "--is-inside-work-tree"]);
    return out === "true";
  } catch {
    return false;
  }
}

export async function getCurrentBranch(dir: string): Promise<string | null> {
  try {
    const out = await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    return out === "HEAD" ? null : out;
  } catch {
    return null;
  }
}

/** Unix timestamp (seconds) of the HEAD commit, or null for empty/unreadable repos. */
export async function getLastCommitTs(dir: string): Promise<number | null> {
  try {
    const out = await git(dir, ["log", "-1", "--format=%ct"]);
    const n = parseInt(out, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function listBranches(dir: string): Promise<Branch[]> {
  try {
    // Custom format so we can parse reliably regardless of branch names.
    const fmt = "%(refname:short)%09%(HEAD)%09%(upstream:short)%09%(objectname:short)%09%(committerdate:relative)";
    const out = await git(dir, ["for-each-ref", "--sort=-committerdate", `--format=${fmt}`, "refs/heads"]);
    if (!out) return [];
    return out.split("\n").map((line) => {
      const [name, head, upstream, commit, date] = line.split("\t");
      return {
        name,
        current: head === "*",
        upstream: upstream || null,
        lastCommit: commit || null,
        lastCommitDate: date || null,
      };
    });
  } catch {
    return [];
  }
}

export async function listWorktrees(dir: string): Promise<Worktree[]> {
  try {
    const out = await git(dir, ["worktree", "list", "--porcelain"]);
    if (!out) return [];
    const mainPath = await git(dir, ["rev-parse", "--show-toplevel"]).catch(() => "");
    const blocks = out.split("\n\n").filter(Boolean);
    return blocks.map((block) => {
      const lines = block.split("\n");
      const wt: Worktree = {
        path: "",
        branch: null,
        head: null,
        bare: false,
        detached: false,
        locked: false,
        isMain: false,
      };
      for (const line of lines) {
        if (line.startsWith("worktree ")) wt.path = line.slice("worktree ".length);
        else if (line.startsWith("HEAD ")) wt.head = line.slice("HEAD ".length).slice(0, 8);
        else if (line.startsWith("branch ")) wt.branch = line.slice("branch ".length).replace("refs/heads/", "");
        else if (line === "bare") wt.bare = true;
        else if (line === "detached") wt.detached = true;
        else if (line.startsWith("locked")) wt.locked = true;
      }
      wt.isMain = wt.path === mainPath;
      return wt;
    });
  } catch {
    return [];
  }
}

export async function checkoutBranch(dir: string, branch: string): Promise<void> {
  await git(dir, ["checkout", branch]);
}

/** Run `git pull` in dir, returning git's combined output. Throws with git's message on failure. */
export async function pull(dir: string): Promise<string> {
  try {
    const { stdout, stderr } = await exec("git", ["pull"], { cwd: dir, maxBuffer: 10 * 1024 * 1024 });
    return `${stdout}${stderr}`.trim() || "Already up to date.";
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const msg = (e.stderr || e.stdout || e.message || "").toString().trim();
    throw new Error(msg || "git pull failed");
  }
}
