import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

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
  lastCommitTs: number | null;
  author: string | null;
  ahead: number;
  behind: number;
  /** True when the branch exists only on a remote (no local ref yet). */
  remoteOnly: boolean;
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
  /** Unix timestamp (seconds) of the worktree's HEAD commit. */
  lastCommitTs: number | null;
  author: string | null;
  /** True when the working tree has uncommitted changes (git status --porcelain). */
  dirty: boolean;
}

export interface Commit {
  sha: string;
  shortSha: string;
  subject: string;
  author: string | null;
  ts: number | null;
  dateRel: string | null;
  /** Number of parents (>1 = merge commit). */
  parents: number;
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

/** The repo's default branch (origin/HEAD, else main/master), or null. */
async function defaultBranch(dir: string): Promise<string | null> {
  const head = await git(dir, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).catch(() => "");
  if (head) return head.replace(/^origin\//, "");
  for (const b of ["main", "master"]) {
    const ok = await git(dir, ["rev-parse", "--verify", "--quiet", b]).catch(() => "");
    if (ok) return b;
  }
  return null;
}

/**
 * Commit timestamps (unix seconds) for the heatmap. For a feature branch this is
 * the commits since it forked from the default branch (merge-base..ref) — i.e.
 * the branch's own work. For the default branch, the last year of history.
 */
export async function getCommitActivity(dir: string, ref?: string): Promise<number[]> {
  try {
    const target = ref || "HEAD";
    const def = await defaultBranch(dir);
    const args = ["log", "--format=%ct", "--max-count=5000", "--since=6.months.ago"];
    let range = target;
    if (def && ref && ref !== def) {
      const base = (await git(dir, ["merge-base", def, target]).catch(() => "")).trim();
      if (base) range = `${base}..${target}`;
    }
    args.push(range);
    const out = await git(dir, args);
    if (!out) return [];
    return out
      .split("\n")
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

/** HEAD commit timestamp + author name for a working directory. */
export async function getHeadMeta(dir: string): Promise<{ ts: number | null; author: string | null }> {
  try {
    const out = await git(dir, ["log", "-1", "--format=%ct%x09%an"]);
    const [ct, an] = out.split("\t");
    const ts = parseInt(ct, 10);
    return { ts: Number.isFinite(ts) ? ts : null, author: an || null };
  } catch {
    return { ts: null, author: null };
  }
}

export async function listBranches(dir: string): Promise<Branch[]> {
  try {
    // Custom format so we can parse reliably regardless of branch names.
    const fmt =
      "%(refname:short)%09%(HEAD)%09%(upstream:short)%09%(objectname:short)%09%(committerdate:relative)%09%(committerdate:unix)%09%(authorname)%09%(upstream:track,nobracket)";
    const out = await git(dir, ["for-each-ref", "--sort=-committerdate", `--format=${fmt}`, "refs/heads"]);
    const local: Branch[] = out
      ? out.split("\n").map((line) => {
          const [name, head, upstream, commit, date, unix, author, track] = line.split("\t");
          const ts = parseInt(unix, 10);
          const aheadM = track?.match(/ahead (\d+)/);
          const behindM = track?.match(/behind (\d+)/);
          return {
            name,
            current: head === "*",
            upstream: upstream || null,
            lastCommit: commit || null,
            lastCommitDate: date || null,
            lastCommitTs: Number.isFinite(ts) ? ts : null,
            author: author || null,
            ahead: aheadM ? parseInt(aheadM[1], 10) : 0,
            behind: behindM ? parseInt(behindM[1], 10) : 0,
            remoteOnly: false,
          };
        })
      : [];

    // Append branches that exist only on a remote (no local ref yet).
    const localNames = new Set(local.map((b) => b.name));
    const seen = new Set<string>();
    const rfmt =
      "%(refname:short)%09%(objectname:short)%09%(committerdate:relative)%09%(committerdate:unix)%09%(authorname)";
    const rout = await git(dir, [
      "for-each-ref",
      "--sort=-committerdate",
      `--format=${rfmt}`,
      "refs/remotes",
    ]).catch(() => "");
    for (const line of rout.split("\n").filter(Boolean)) {
      const [full, commit, date, unix, author] = line.split("\t");
      if (!full || full.endsWith("/HEAD")) continue; // skip the remote's symbolic HEAD
      const slash = full.indexOf("/");
      if (slash < 0) continue;
      const name = full.slice(slash + 1); // "origin/feature" -> "feature"
      if (localNames.has(name) || seen.has(name)) continue;
      seen.add(name);
      const ts = parseInt(unix, 10);
      local.push({
        name,
        current: false,
        upstream: full,
        lastCommit: commit || null,
        lastCommitDate: date || null,
        lastCommitTs: Number.isFinite(ts) ? ts : null,
        author: author || null,
        ahead: 0,
        behind: 0,
        remoteOnly: true,
      });
    }
    return local;
  } catch {
    return [];
  }
}

/** Fetch all remotes and prune deleted remote branches. Returns git's output. */
export async function fetchRemotes(dir: string): Promise<string> {
  try {
    const { stdout, stderr } = await exec("git", ["fetch", "--all", "--prune"], {
      cwd: dir,
      maxBuffer: 10 * 1024 * 1024,
    });
    return `${stdout}${stderr}`.trim() || "Already up to date.";
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    throw new Error((e.stderr || e.stdout || e.message || "").toString().trim() || "git fetch failed");
  }
}

export async function listWorktrees(dir: string): Promise<Worktree[]> {
  try {
    const out = await git(dir, ["worktree", "list", "--porcelain"]);
    if (!out) return [];
    const mainPath = await git(dir, ["rev-parse", "--show-toplevel"]).catch(() => "");
    const blocks = out.split("\n\n").filter(Boolean);
    const parsed = blocks.map((block) => {
      const lines = block.split("\n");
      const wt: Worktree = {
        path: "",
        branch: null,
        head: null,
        bare: false,
        detached: false,
        locked: false,
        isMain: false,
        lastCommitTs: null,
        author: null,
        dirty: false,
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
    // Drop stale worktrees whose directory no longer exists (prunable entries).
    const existing = parsed.filter((w) => w.path && existsSync(w.path));
    // Attach each worktree's HEAD commit time + author so the UI can sort/filter.
    await Promise.all(
      existing.map(async (w) => {
        const meta = await getHeadMeta(w.path);
        w.lastCommitTs = meta.ts;
        w.author = meta.author;
        const status = await git(w.path, ["status", "--porcelain"]).catch(() => "");
        w.dirty = status.trim().length > 0;
      }),
    );
    return existing;
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

/**
 * Bring a specific branch up to date with its upstream. If the branch is checked
 * out (in the main repo or a worktree), does a plain `git pull` there. Otherwise
 * fast-forwards the local ref from the remote without checking it out.
 */
export async function pullBranch(mainDir: string, branch: string, cwd?: string): Promise<string> {
  const dir = cwd || mainDir;
  const current = await getCurrentBranch(dir);
  if (current === branch) return pull(dir);

  // Non-checked-out branch: fast-forward its ref from the configured upstream.
  const info = await git(mainDir, [
    "for-each-ref",
    "--format=%(upstream:remotename)%09%(upstream:short)",
    `refs/heads/${branch}`,
  ]).catch(() => "");
  const [remote, upstreamShort] = info.split("\t");
  if (!remote || !upstreamShort) throw new Error("No upstream configured for this branch");
  const remoteBranch = upstreamShort.startsWith(`${remote}/`)
    ? upstreamShort.slice(remote.length + 1)
    : upstreamShort;
  const before = await git(mainDir, ["rev-parse", branch]).catch(() => "");
  try {
    const { stdout, stderr } = await exec("git", ["fetch", remote, `${remoteBranch}:${branch}`], {
      cwd: mainDir,
      maxBuffer: 10 * 1024 * 1024,
    });
    const after = await git(mainDir, ["rev-parse", branch]).catch(() => "");
    if (before && before === after) return "Already up to date.";
    return `${stdout}${stderr}`.trim() || `Fast-forwarded ${branch}.`;
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    throw new Error((e.stderr || e.stdout || e.message || "").toString().trim() || "fetch failed");
  }
}

/** Recent commits for a ref (default HEAD). For the timeline/graph view. */
export async function listCommits(dir: string, ref?: string, limit = 50): Promise<Commit[]> {
  try {
    const target = ref || "HEAD";
    const fmt = "%H%x1f%h%x1f%s%x1f%an%x1f%ct%x1f%p";
    const out = await git(dir, ["log", `--format=${fmt}`, `--max-count=${limit}`, target]);
    if (!out) return [];
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, shortSha, subject, author, ct, parents] = line.split("\x1f");
        const ts = parseInt(ct, 10);
        return {
          sha,
          shortSha,
          subject: subject || "",
          author: author || null,
          ts: Number.isFinite(ts) ? ts : null,
          dateRel: null,
          parents: parents ? parents.trim().split(/\s+/).filter(Boolean).length : 0,
        };
      });
  } catch {
    return [];
  }
}

/**
 * A plain git ref name — rejects flag-shaped/metacharacter input so it can't be
 * smuggled in as a git flag when spliced into a diff range. Mirrors `git.rs`'s
 * `valid_ref`.
 */
function validRef(s: string): boolean {
  return s.length > 0 && !s.startsWith("-") && /^[A-Za-z0-9._/-]+$/.test(s);
}

/**
 * Unified diff. Precedence:
 * - `against` (a base branch): the changes this branch introduced relative to its
 *   base — `git diff <base>...HEAD` (i.e. vs their merge-base). The base is
 *   validated as a plain ref and the range is followed by `--` so a flag-shaped
 *   base can't be parsed as a git flag; an invalid base yields an empty diff.
 * - `sha`: that commit's changes.
 * - neither: the working-tree changes vs HEAD.
 */
export async function getDiff(dir: string, sha?: string, against?: string): Promise<string> {
  try {
    if (against !== undefined) {
      if (!validRef(against)) return "";
      return await git(dir, ["diff", "--no-color", `${against}...HEAD`, "--"]);
    }
    const args = sha
      ? ["show", "--no-color", "--stat", "--patch", sha]
      : ["diff", "--no-color", "HEAD"];
    return await git(dir, args);
  } catch {
    return "";
  }
}

/** Upper bound on the file list so a huge repo can't flood the composer typeahead. */
const FILE_LIST_CAP = 5000;

/**
 * Repo-relative paths of tracked + untracked-but-not-ignored files in `dir`
 * (via `git ls-files --cached --others --exclude-standard`), capped to a sane
 * max. Mirrors `git.rs`'s `list_files`.
 */
export async function listFiles(dir: string): Promise<string[]> {
  try {
    const out = await git(dir, ["ls-files", "--cached", "--others", "--exclude-standard"]);
    if (!out) return [];
    return out.split("\n").filter(Boolean).slice(0, FILE_LIST_CAP);
  } catch {
    return [];
  }
}
