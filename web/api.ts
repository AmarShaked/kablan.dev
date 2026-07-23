export interface AppConfig {
  parentDir: string;
  maxScanDepth: number;
  envFiles: string[];
  devScriptPriority: string[];
  maxLogLines: number;
  showNonNodeProjects: boolean;
  linearWorkspace: string;
  overrides: Record<string, { devCommand?: string }>;
}

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
  remoteOnly: boolean;
}

export interface Worktree {
  path: string;
  branch: string | null;
  head: string | null;
  bare: boolean;
  detached: boolean;
  locked: boolean;
  isMain: boolean;
  lastCommitTs: number | null;
  author: string | null;
  dirty: boolean;
}

export interface Commit {
  sha: string;
  shortSha: string;
  subject: string;
  author: string | null;
  ts: number | null;
  dateRel: string | null;
  parents: number;
}

export type OpenTarget = "vscode" | "cursor" | "terminal" | "iterm" | "finder" | "url";

export interface EnvFile {
  name: string;
  exists: boolean;
  content: string;
}

export interface GitlabMergeRequest {
  iid: number;
  title: string;
  state: string;
  draft: boolean;
  webUrl: string;
  sourceBranch: string;
  targetBranch: string;
  pipelineStatus: string | null;
  approvalsRequired: number | null;
  approvalsLeft: number | null;
}

export interface GitlabPipeline {
  ref: string;
  sha: string;
  status: string;
  webUrl: string;
}

export interface GitlabOverview {
  connected: boolean;
  host: string | null;
  project: string | null;
  mrs: GitlabMergeRequest[];
  pipelines: GitlabPipeline[];
  error?: string;
}

export type ServerStatus = "starting" | "running" | "stopped" | "exited" | "error";

export interface RunningServer {
  projectName: string;
  cwd: string;
  command: string;
  branch: string | null;
  pid: number | null;
  status: ServerStatus;
  startedAt: number;
  exitCode: number | null;
}

export interface LogLine {
  ts: number;
  stream: "stdout" | "stderr" | "system";
  text: string;
}

// In the Tauri app the UI is served from the bundled assets, so it must reach the
// local Rust backend by absolute URL (the port is injected by the shell). In the
// browser dev server, requests stay relative and go through the Vite proxy.
export const API_BASE =
  typeof window !== "undefined" && window.__KABLAN_PORT__
    ? `http://127.0.0.1:${window.__KABLAN_PORT__}`
    : "";

export function wsUrl(): string {
  if (typeof window !== "undefined" && window.__KABLAN_PORT__) {
    return `ws://127.0.0.1:${window.__KABLAN_PORT__}/ws`;
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

async function req<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  getConfig: () => req<AppConfig>("/api/config"),
  getDefaults: () => req<AppConfig>("/api/config/defaults"),
  setParentDir: (parentDir: string) =>
    req<AppConfig>("/api/config", { method: "PUT", body: JSON.stringify({ parentDir }) }),
  updateConfig: (patch: Partial<AppConfig>) =>
    req<AppConfig>("/api/config", { method: "PUT", body: JSON.stringify(patch) }),
  resetConfig: () => req<AppConfig>("/api/config/reset", { method: "POST" }),
  clearOverride: (name: string) =>
    req<AppConfig>(`/api/config/overrides/${encodeURIComponent(name)}`, { method: "DELETE" }),

  listProjects: () => req<ProjectSummary[]>("/api/projects"),
  getBranches: (name: string) => req<Branch[]>(`/api/projects/${encodeURIComponent(name)}/branches`),
  getWorktrees: (name: string) => req<Worktree[]>(`/api/projects/${encodeURIComponent(name)}/worktrees`),
  getCommits: (name: string, opts: { ref?: string; cwd?: string } = {}) => {
    const p = new URLSearchParams();
    if (opts.ref) p.set("ref", opts.ref);
    if (opts.cwd) p.set("cwd", opts.cwd);
    const qs = p.toString();
    return req<{ timestamps: number[] }>(
      `/api/projects/${encodeURIComponent(name)}/commits${qs ? `?${qs}` : ""}`,
    );
  },
  checkout: (name: string, branch: string) =>
    req<{ currentBranch: string | null }>(`/api/projects/${encodeURIComponent(name)}/checkout`, {
      method: "POST",
      body: JSON.stringify({ branch }),
    }),
  pull: (name: string) =>
    req<{ output: string; currentBranch: string | null }>(
      `/api/projects/${encodeURIComponent(name)}/pull`,
      { method: "POST" },
    ),
  pullBranch: (name: string, branch: string, cwd?: string) =>
    req<{ output: string }>(`/api/projects/${encodeURIComponent(name)}/pull-branch`, {
      method: "POST",
      body: JSON.stringify({ branch, cwd }),
    }),
  fetchRemote: (name: string) =>
    req<{ output: string }>(`/api/projects/${encodeURIComponent(name)}/fetch`, { method: "POST" }),
  getLog: (name: string, opts: { ref?: string; cwd?: string; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.ref) p.set("ref", opts.ref);
    if (opts.cwd) p.set("cwd", opts.cwd);
    if (opts.limit) p.set("limit", String(opts.limit));
    const qs = p.toString();
    return req<{ commits: Commit[] }>(
      `/api/projects/${encodeURIComponent(name)}/log${qs ? `?${qs}` : ""}`,
    );
  },
  getDiff: (name: string, opts: { sha?: string; cwd?: string } = {}) => {
    const p = new URLSearchParams();
    if (opts.sha) p.set("sha", opts.sha);
    if (opts.cwd) p.set("cwd", opts.cwd);
    const qs = p.toString();
    return req<{ diff: string }>(
      `/api/projects/${encodeURIComponent(name)}/diff${qs ? `?${qs}` : ""}`,
    );
  },
  openIn: (name: string, target: OpenTarget, opts: { cwd?: string; url?: string } = {}) =>
    req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(name)}/open`, {
      method: "POST",
      body: JSON.stringify({ target, ...opts }),
    }),

  gitlab: {
    hosts: () => req<{ hosts: string[] }>("/api/gitlab/hosts"),
    setToken: (host: string, token: string) =>
      req<{ ok: boolean; username: string }>("/api/gitlab/token", {
        method: "PUT",
        body: JSON.stringify({ host, token }),
      }),
    deleteToken: (host: string) =>
      req<{ ok: boolean }>("/api/gitlab/token", { method: "DELETE", body: JSON.stringify({ host }) }),
    overview: (name: string) =>
      req<GitlabOverview>(`/api/projects/${encodeURIComponent(name)}/gitlab/overview`),
    createMr: (
      name: string,
      body: {
        sourceBranch: string;
        targetBranch: string;
        title: string;
        description?: string;
        draft?: boolean;
        removeSourceBranch?: boolean;
      },
    ) =>
      req<{ iid: number; webUrl: string }>(`/api/projects/${encodeURIComponent(name)}/gitlab/mr`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  getEnv: (name: string, cwd?: string) =>
    req<EnvFile[]>(
      `/api/projects/${encodeURIComponent(name)}/env${cwd ? `?cwd=${encodeURIComponent(cwd)}` : ""}`,
    ),
  saveEnv: (name: string, file: string, content: string, cwd?: string) =>
    req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(name)}/env`, {
      method: "PUT",
      body: JSON.stringify({ name: file, content, cwd }),
    }),

  setCommand: (name: string, devCommand: string) =>
    req<{ devCommand: string }>(`/api/projects/${encodeURIComponent(name)}/command`, {
      method: "PUT",
      body: JSON.stringify({ devCommand }),
    }),

  getServer: (name: string) => req<RunningServer | null>(`/api/projects/${encodeURIComponent(name)}/server`),
  getLogs: (name: string) => req<LogLine[]>(`/api/projects/${encodeURIComponent(name)}/logs`),
  startServer: (name: string, body: { cwd?: string; command?: string; branch?: string | null }) =>
    req<RunningServer>(`/api/projects/${encodeURIComponent(name)}/server/start`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  stopServer: (name: string) =>
    req<{ stopped: boolean }>(`/api/projects/${encodeURIComponent(name)}/server/stop`, { method: "POST" }),
  getAllServers: () => req<RunningServer[]>("/api/servers"),
};
