/**
 * Black-box test harness for the Kablan.dev server.
 *
 * It boots the server-under-test as a child process (Node by default, or the
 * Rust binary when KABLAN_SERVER_CMD is set), talking to it purely over HTTP/WS.
 * Fixtures are hermetic: a fresh temp workspace of real git repos and a temp
 * config dir per server, an OS-assigned port. The SAME suites run against both
 * implementations, so a green run proves behavioral parity.
 */
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/** Command that starts the server. Override to point the suite at the Rust binary. */
const SERVER_CMD = process.env.KABLAN_SERVER_CMD
  ? process.env.KABLAN_SERVER_CMD.split(" ")
  : ["node", "--import", "tsx", "server/index.ts"];

/** Hermetic git env so fixtures don't depend on the machine's global git config. */
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "Test User",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test User",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

export async function git(cwd: string, args: string[], extraEnv: Record<string, string> = {}): Promise<string> {
  const { stdout } = await execFileP("git", args, {
    cwd,
    env: { ...process.env, ...GIT_ENV, ...extraEnv },
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

/** Initialise a git repo on branch `main` with an initial commit. */
export async function initRepo(dir: string, files: Record<string, string> = { "README.md": "# repo\n" }): Promise<void> {
  mkdirSync(dir, { recursive: true });
  await git(dir, ["init"]);
  await git(dir, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  await git(dir, ["config", "user.email", "test@example.com"]);
  await git(dir, ["config", "user.name", "Test User"]);
  await git(dir, ["config", "commit.gpgsign", "false"]);
  await commit(dir, "initial commit", files);
}

/** Write files and create a commit. `date` (ISO) makes the commit deterministic. */
export async function commit(
  dir: string,
  message: string,
  files: Record<string, string> = {},
  date?: string,
): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  await git(dir, ["add", "-A"]);
  const env: Record<string, string> = date
    ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
    : {};
  await git(dir, ["commit", "--allow-empty", "-m", message], env);
}

export async function createBranch(dir: string, name: string): Promise<void> {
  await git(dir, ["branch", name]);
}

export async function checkout(dir: string, ref: string): Promise<void> {
  await git(dir, ["checkout", ref]);
}

/** Add a bare "remote" repo and push `main` with upstream tracking. Returns the bare path. */
export async function addRemote(mainDir: string, bareDir: string): Promise<string> {
  mkdirSync(bareDir, { recursive: true });
  await git(bareDir, ["init", "--bare"]);
  await git(mainDir, ["remote", "add", "origin", bareDir]);
  await git(mainDir, ["push", "-u", "origin", "main"]);
  return bareDir;
}

/** Push a branch to origin with upstream tracking. */
export async function pushBranch(mainDir: string, branch: string): Promise<void> {
  await git(mainDir, ["push", "-u", "origin", branch]);
}

/**
 * Advance a branch on the remote (via a throwaway clone) so the original repo's
 * local ref is "behind". Used to exercise pull / pull-branch fast-forward.
 */
export async function advanceRemote(bareDir: string, branch: string, message = "remote commit"): Promise<void> {
  const clone = mkdtempSync(join(tmpdir(), "kablan-clone-"));
  await git(clone, ["clone", bareDir, "."]);
  await git(clone, ["config", "user.email", "test@example.com"]);
  await git(clone, ["config", "user.name", "Test User"]);
  await git(clone, ["checkout", branch]);
  await commit(clone, message, { [`remote-${Date.now()}.txt`]: "x" });
  await git(clone, ["push", "origin", branch]);
  rmSync(clone, { recursive: true, force: true });
  // Fetch so the origin's new tip is known locally (mirrors a real user having fetched).
}

/** Create a brand-new branch that exists ONLY on the remote (never checked out locally). */
export async function addRemoteBranch(bareDir: string, branch: string, message = "remote branch"): Promise<void> {
  const clone = mkdtempSync(join(tmpdir(), "kablan-rb-"));
  await git(clone, ["clone", bareDir, "."]);
  await git(clone, ["config", "user.email", "test@example.com"]);
  await git(clone, ["config", "user.name", "Test User"]);
  await git(clone, ["checkout", "-b", branch]);
  await commit(clone, message, { [`rb-${branch.replace(/\W/g, "_")}.txt`]: "x" });
  await git(clone, ["push", "-u", "origin", branch]);
  rmSync(clone, { recursive: true, force: true });
}

export async function addWorktree(mainDir: string, wtPath: string, branch: string, newBranch = true): Promise<void> {
  const args = newBranch
    ? ["worktree", "add", "-b", branch, wtPath]
    : ["worktree", "add", wtPath, branch];
  await git(mainDir, args);
}

export interface HttpResult {
  status: number;
  json: any;
  text: string;
}

export function client(baseUrl: string) {
  const req = async (method: string, path: string, body?: unknown): Promise<HttpResult> => {
    const res = await fetch(baseUrl + path, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, json, text };
  };
  return {
    get: (p: string) => req("GET", p),
    post: (p: string, b?: unknown) => req("POST", p, b),
    put: (p: string, b?: unknown) => req("PUT", p, b),
    del: (p: string) => req("DELETE", p),
  };
}

export interface TestServer {
  port: number;
  baseUrl: string;
  wsUrl: string;
  api: ReturnType<typeof client>;
  /** Temp parent dir the server scans for repos. */
  workspace: string;
  /** Temp config dir (KABLAN_CONFIG_DIR). */
  configDir: string;
  /** Captured server stdout+stderr (for debugging failures). */
  output: () => string;
  stop: () => Promise<void>;
}

/**
 * Boot a fresh server. `config` is written to config.json (merged with the
 * server's own defaults); `parentDir` defaults to a fresh temp workspace.
 */
export async function startServer(
  opts: { config?: Record<string, unknown>; parentDir?: string } = {},
): Promise<TestServer> {
  // realpath so paths match what git reports (macOS /var → /private/var symlink).
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kablan-test-")));
  const workspace = opts.parentDir ?? join(root, "workspace");
  mkdirSync(workspace, { recursive: true });
  const configDir = join(root, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ parentDir: workspace, ...opts.config }, null, 2),
  );

  const proc: ChildProcess = spawn(SERVER_CMD[0], SERVER_CMD.slice(1), {
    env: { ...process.env, PORT: "0", KABLAN_CONFIG_DIR: configDir },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let buf = "";
  proc.stdout!.on("data", (d) => (buf += d.toString()));
  proc.stderr!.on("data", (d) => (buf += d.toString()));

  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start in time:\n${buf}`)), 30_000);
    const check = () => {
      const m = buf.match(/listening on https?:\/\/[^:]+:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    };
    proc.stdout!.on("data", check);
    proc.stderr!.on("data", check);
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early (code=${code}):\n${buf}`));
    });
    check();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (proc.exitCode != null || proc.signalCode) return;
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          /* gone */
        }
        resolve();
      }, 5000);
      proc.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
      proc.kill("SIGTERM");
    });
    rmSync(root, { recursive: true, force: true });
  };

  return {
    port,
    baseUrl,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    api: client(baseUrl),
    workspace,
    configDir,
    output: () => buf,
    stop,
  };
}
