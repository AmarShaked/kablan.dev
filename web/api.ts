export interface NotificationSettings {
  enabled: boolean;
  events: string[];
}

export interface FactorySettings {
  agentCommand: string;
  agentModel: string;
  permissionMode: "default" | "acceptEdits" | "auto" | "bypassPermissions" | "supervised";
  defaultBaseBranch: string;
  worktreeRoot: string;
  branchPattern: string;
  maxConcurrentAgents: number;
  stopAgentsOnExit: boolean;
  autoResumeAgents: boolean;
  chatHistoryDays: number;
  mcpConfigPath: string;
  notifications: NotificationSettings;
}

export interface AppConfig {
  parentDir: string;
  maxScanDepth: number;
  envFiles: string[];
  devScriptPriority: string[];
  maxLogLines: number;
  showNonNodeProjects: boolean;
  linearWorkspace: string;
  overrides: Record<string, { devCommand?: string }>;
  factory: FactorySettings;
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

export type AgentStatus = "idle" | "working" | "awaitingInput" | "done" | "failed";
export interface AgentView {
  key: string;
  status: AgentStatus;
  sessionId: string | null;
  pid: number | null;
  startedAt: number;
  exitCode: number | null;
}
/// A pending per-tool approval (supervised permission mode). Mirrors the `approval` object in the
/// `agent-approval` ws frame and the `approvals` array from `getAgent`.
export interface AgentApproval {
  id: string;
  toolName: string;
  input: unknown;
  createdAt: number;
}
export interface Feature {
  id: string;
  name: string;
  branches: string[];
}
export interface BranchState {
  worktreePath?: string;
  agentSessionId?: string;
  createdAt: number;
  /** Friendly display title shown in the sidebar/cockpit instead of the raw git branch name.
   * Does NOT rename the branch — the branch name stays the key. */
  title?: string;
}
export interface FactoryOverview {
  features: Feature[];
  branchState: Record<string, BranchState>;
}

export interface InboxEntry {
  project: string;
  branch: string;
  featureId?: string;
  featureName?: string;
  status: string;
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
  getDiff: (name: string, opts: { sha?: string; cwd?: string; against?: string } = {}) => {
    const p = new URLSearchParams();
    if (opts.sha) p.set("sha", opts.sha);
    if (opts.cwd) p.set("cwd", opts.cwd);
    if (opts.against) p.set("against", opts.against);
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

  factory: {
    list: (name: string) => req<FactoryOverview>(`/api/projects/${encodeURIComponent(name)}/factory`),
    createFeature: (name: string, featureName: string) =>
      req<Feature>(`/api/projects/${encodeURIComponent(name)}/factory/features`, {
        method: "POST",
        body: JSON.stringify({ name: featureName }),
      }),
    deleteFeature: (name: string, fid: string) =>
      req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(name)}/factory/features/${encodeURIComponent(fid)}`, {
        method: "DELETE",
      }),
    fileBranch: (name: string, fid: string, branch: string) =>
      req<{ ok: boolean }>(
        `/api/projects/${encodeURIComponent(name)}/factory/features/${encodeURIComponent(fid)}/file`,
        { method: "POST", body: JSON.stringify({ branch }) },
      ),
    unfileBranch: (name: string, fid: string, branch: string) =>
      req<{ ok: boolean }>(
        `/api/projects/${encodeURIComponent(name)}/factory/features/${encodeURIComponent(fid)}/unfile`,
        { method: "POST", body: JSON.stringify({ branch }) },
      ),
    // Drag-and-drop reordering — persists the sidebar's manual order. `reorderFeatureBranches`
    // takes the feature's full new branch order (a permutation of its current branches);
    // `reorderFeatures` takes the project's full new feature-id order (a permutation of the
    // current set). Both reject a request that isn't an exact permutation.
    reorderFeatureBranches: (name: string, fid: string, branches: string[]) =>
      req<{ ok: boolean }>(
        `/api/projects/${encodeURIComponent(name)}/factory/features/${encodeURIComponent(fid)}/reorder`,
        { method: "POST", body: JSON.stringify({ branches }) },
      ),
    reorderFeatures: (name: string, order: string[]) =>
      req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(name)}/factory/features/reorder`, {
        method: "POST",
        body: JSON.stringify({ order }),
      }),

    // Sets (or clears, with an empty string) a branch's friendly DISPLAY TITLE — shown in the
    // sidebar/cockpit instead of the raw git branch name. Never renames the branch itself.
    setBranchTitle: (name: string, branch: string, title: string) =>
      req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(name)}/factory/branch/title`, {
        method: "POST",
        body: JSON.stringify({ branch, title }),
      }),

    // "New session" flow: the user picks only a base branch to branch off — Kablan generates
    // the new branch name, worktree, and starts its agent server-side (see `lib.rs`'s
    // `post_new_session`). `message`, if given, is delivered as the agent's first message.
    startSession: (
      name: string,
      baseBranch: string,
      opts: { message?: string; copyNodeModules?: boolean; copyEnv?: boolean } = {},
    ) =>
      req<{ branch: string }>(`/api/projects/${encodeURIComponent(name)}/factory/session`, {
        method: "POST",
        body: JSON.stringify({
          baseBranch,
          message: opts.message,
          copyNodeModules: opts.copyNodeModules,
          copyEnv: opts.copyEnv,
        }),
      }),

    // Branch-keyed agent calls — branch always travels in the body/query (never the path),
    // since branch names contain `/`. See `branchKey` (`../lib/agentKey.ts`) for the matching
    // WS/agent-stream key.
    agentStart: (
      name: string,
      branch: string,
      opts: { copyNodeModules?: boolean; copyEnv?: boolean; model?: string; permissionMode?: string } = {},
    ) =>
      req<AgentView>(`/api/projects/${encodeURIComponent(name)}/factory/agent/start`, {
        method: "POST",
        body: JSON.stringify({ branch, ...opts }),
      }),
    agentMessage: (
      name: string,
      branch: string,
      text: string,
      images: { mediaType: string; data: string }[] = [],
    ) =>
      req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(name)}/factory/agent/message`, {
        method: "POST",
        body: JSON.stringify(images.length ? { branch, text, images } : { branch, text }),
      }),
    agentStop: (name: string, branch: string) =>
      req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(name)}/factory/agent/stop`, {
        method: "POST",
        body: JSON.stringify({ branch }),
      }),
    // Resolve a supervised per-tool approval. `decision` is "allow" or "deny"; `reason` is an
    // optional note surfaced to the agent on deny.
    resolveApproval: (
      name: string,
      branch: string,
      approvalId: string,
      decision: "allow" | "deny",
      reason?: string,
    ) =>
      req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(name)}/factory/agent/approval`, {
        method: "POST",
        body: JSON.stringify(reason !== undefined ? { branch, approvalId, decision, reason } : { branch, approvalId, decision }),
      }),
    getAgent: (name: string, branch: string) =>
      req<{ agent: AgentView | null; events: unknown[]; approvals: AgentApproval[] }>(
        `/api/projects/${encodeURIComponent(name)}/factory/agent?branch=${encodeURIComponent(branch)}`,
      ),
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

  // `cwd` targets a specific working copy; omit it for the project's main-path server (backward-compat).
  getServer: (name: string, cwd?: string) =>
    req<RunningServer | null>(
      `/api/projects/${encodeURIComponent(name)}/server${cwd ? `?cwd=${encodeURIComponent(cwd)}` : ""}`,
    ),
  getLogs: (name: string, cwd?: string) =>
    req<LogLine[]>(
      `/api/projects/${encodeURIComponent(name)}/logs${cwd ? `?cwd=${encodeURIComponent(cwd)}` : ""}`,
    ),
  startServer: (name: string, body: { cwd?: string; command?: string; branch?: string | null }) =>
    req<RunningServer>(`/api/projects/${encodeURIComponent(name)}/server/start`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  stopServer: (name: string, cwd?: string) =>
    req<{ stopped: boolean }>(`/api/projects/${encodeURIComponent(name)}/server/stop`, {
      method: "POST",
      body: JSON.stringify(cwd ? { cwd } : {}),
    }),
  getAllServers: () => req<RunningServer[]>("/api/servers"),

  inbox: () => req<InboxEntry[]>("/api/inbox"),
};
