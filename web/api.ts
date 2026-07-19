export interface AppConfig {
  parentDir: string;
  maxScanDepth: number;
  envFiles: string[];
  devScriptPriority: string[];
  maxLogLines: number;
  showNonNodeProjects: boolean;
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
}

export interface Worktree {
  path: string;
  branch: string | null;
  head: string | null;
  bare: boolean;
  detached: boolean;
  locked: boolean;
  isMain: boolean;
}

export interface EnvFile {
  name: string;
  exists: boolean;
  content: string;
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

async function req<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
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
