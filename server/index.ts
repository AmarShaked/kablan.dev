import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig, saveConfig, setOverride, clearOverride, DEFAULT_CONFIG } from "./config.ts";
import {
  listBranches,
  listWorktrees,
  checkoutBranch,
  getCurrentBranch,
  pull,
  pullBranch,
  fetchRemotes,
  getCommitActivity,
  listCommits,
  getDiff,
} from "./git.ts";
import { openTarget, type OpenTarget } from "./open.ts";
import {
  listProjects,
  readEnvFiles,
  writeEnvFile,
  projectPathFromName,
  resolveDevCommand,
  resolveWorkdir,
} from "./projects.ts";
import {
  startServer,
  stopServer,
  getServer,
  getAllServers,
  getLogs,
  killAll,
  serverEvents,
} from "./processes.ts";

// PORT is overridable via env; PORT=0 lets the OS pick a free port (used by tests).
const PORT = process.env.PORT !== undefined ? Number(process.env.PORT) : 4317;
const HOST = "127.0.0.1";
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const api = express.Router();

// --- Config ---
api.get("/config", (_req, res) => res.json(loadConfig()));
api.get("/config/defaults", (_req, res) => res.json(DEFAULT_CONFIG));

api.put("/config", (req, res) => {
  const body = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (typeof body.parentDir === "string") patch.parentDir = body.parentDir;
  if (typeof body.maxScanDepth === "number" && body.maxScanDepth >= 1) {
    patch.maxScanDepth = Math.min(8, Math.floor(body.maxScanDepth));
  }
  if (Array.isArray(body.envFiles)) {
    patch.envFiles = body.envFiles.map(String).map((s: string) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(body.devScriptPriority)) {
    patch.devScriptPriority = body.devScriptPriority.map(String).map((s: string) => s.trim()).filter(Boolean);
  }
  if (typeof body.maxLogLines === "number" && body.maxLogLines > 0) {
    patch.maxLogLines = Math.floor(body.maxLogLines);
  }
  if (typeof body.showNonNodeProjects === "boolean") patch.showNonNodeProjects = body.showNonNodeProjects;
  if (typeof body.linearWorkspace === "string") patch.linearWorkspace = body.linearWorkspace.trim();
  const next = saveConfig(patch);
  res.json(next);
});

api.post("/config/reset", (_req, res) => {
  const current = loadConfig();
  // Reset everything except the user's project overrides.
  const next = saveConfig({
    parentDir: DEFAULT_CONFIG.parentDir,
    maxScanDepth: DEFAULT_CONFIG.maxScanDepth,
    envFiles: [...DEFAULT_CONFIG.envFiles],
    devScriptPriority: [...DEFAULT_CONFIG.devScriptPriority],
    maxLogLines: DEFAULT_CONFIG.maxLogLines,
    showNonNodeProjects: DEFAULT_CONFIG.showNonNodeProjects,
    linearWorkspace: DEFAULT_CONFIG.linearWorkspace,
    overrides: current.overrides,
  });
  res.json(next);
});

api.delete("/config/overrides/:name", (req, res) => {
  try {
    const dir = projectPathFromName(req.params.name);
    res.json(clearOverride(dir));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// --- Projects ---
api.get("/projects", async (_req, res) => {
  try {
    res.json(await listProjects());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.get("/projects/:name/branches", async (req, res) => {
  try {
    const dir = projectPathFromName(req.params.name);
    res.json(await listBranches(dir));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

api.get("/projects/:name/worktrees", async (req, res) => {
  try {
    const dir = projectPathFromName(req.params.name);
    res.json(await listWorktrees(dir));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

api.get("/projects/:name/commits", async (req, res) => {
  try {
    const cwdParam = typeof req.query.cwd === "string" ? req.query.cwd : undefined;
    const dir = cwdParam
      ? await resolveWorkdir(req.params.name, cwdParam)
      : projectPathFromName(req.params.name);
    const ref = typeof req.query.ref === "string" && req.query.ref ? req.query.ref : undefined;
    res.json({ timestamps: await getCommitActivity(dir, ref) });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

api.get("/projects/:name/log", async (req, res) => {
  try {
    const cwdParam = typeof req.query.cwd === "string" ? req.query.cwd : undefined;
    const dir = cwdParam
      ? await resolveWorkdir(req.params.name, cwdParam)
      : projectPathFromName(req.params.name);
    const ref = typeof req.query.ref === "string" && req.query.ref ? req.query.ref : undefined;
    const limit = typeof req.query.limit === "string" ? Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50)) : 50;
    res.json({ commits: await listCommits(dir, ref, limit) });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

api.get("/projects/:name/diff", async (req, res) => {
  try {
    const cwdParam = typeof req.query.cwd === "string" ? req.query.cwd : undefined;
    const dir = cwdParam
      ? await resolveWorkdir(req.params.name, cwdParam)
      : projectPathFromName(req.params.name);
    const sha = typeof req.query.sha === "string" && req.query.sha ? req.query.sha : undefined;
    const against = typeof req.query.against === "string" && req.query.against ? req.query.against : undefined;
    res.json({ diff: await getDiff(dir, sha, against) });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

api.post("/projects/:name/open", async (req, res) => {
  try {
    const { target, cwd, url } = req.body ?? {};
    const valid: OpenTarget[] = ["vscode", "cursor", "terminal", "iterm", "finder", "url"];
    if (!valid.includes(target)) return res.status(400).json({ error: "invalid target" });
    const arg =
      target === "url"
        ? (typeof url === "string" ? url : "")
        : await resolveWorkdir(req.params.name, typeof cwd === "string" ? cwd : undefined);
    if (!arg) return res.status(400).json({ error: "missing url/cwd" });
    await openTarget(target, arg);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

api.post("/projects/:name/checkout", async (req, res) => {
  try {
    const dir = projectPathFromName(req.params.name);
    const { branch } = req.body ?? {};
    if (typeof branch !== "string" || !branch) {
      return res.status(400).json({ error: "branch is required" });
    }
    await checkoutBranch(dir, branch);
    res.json({ currentBranch: await getCurrentBranch(dir) });
  } catch (err) {
    // git checkout writes its reason (e.g. local changes) to stderr.
    const e = err as { stderr?: string };
    res.status(400).json({ error: (e.stderr || String(err)).trim() });
  }
});

api.post("/projects/:name/pull", async (req, res) => {
  try {
    const dir = projectPathFromName(req.params.name);
    const output = await pull(dir);
    res.json({ output, currentBranch: await getCurrentBranch(dir) });
  } catch (err) {
    res.status(400).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

api.post("/projects/:name/fetch", async (req, res) => {
  try {
    const dir = projectPathFromName(req.params.name);
    res.json({ output: await fetchRemotes(dir) });
  } catch (err) {
    res.status(400).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

api.post("/projects/:name/pull-branch", async (req, res) => {
  try {
    const dir = projectPathFromName(req.params.name);
    const { branch, cwd } = req.body ?? {};
    if (typeof branch !== "string" || !branch) {
      return res.status(400).json({ error: "branch is required" });
    }
    const workdir = cwd ? await resolveWorkdir(req.params.name, cwd) : undefined;
    const output = await pullBranch(dir, branch, workdir);
    res.json({ output });
  } catch (err) {
    res.status(400).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// --- Env files ---
api.get("/projects/:name/env", async (req, res) => {
  try {
    const cwd = typeof req.query.cwd === "string" ? req.query.cwd : undefined;
    const dir = await resolveWorkdir(req.params.name, cwd);
    res.json(readEnvFiles(dir));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

api.put("/projects/:name/env", async (req, res) => {
  try {
    const { name, content, cwd } = req.body ?? {};
    const dir = await resolveWorkdir(req.params.name, typeof cwd === "string" ? cwd : undefined);
    if (typeof name !== "string" || typeof content !== "string") {
      return res.status(400).json({ error: "name and content are required" });
    }
    writeEnvFile(dir, name, content);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// --- Dev command override ---
api.put("/projects/:name/command", (req, res) => {
  try {
    const dir = projectPathFromName(req.params.name);
    const { devCommand } = req.body ?? {};
    setOverride(dir, { devCommand: typeof devCommand === "string" ? devCommand : "" });
    res.json({ devCommand: resolveDevCommand(dir) });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// --- Servers ---
api.get("/servers", (_req, res) => res.json(getAllServers()));

api.get("/projects/:name/server", (req, res) => {
  // `?cwd=` targets a specific working copy; no cwd → the project's main path (backward-compat).
  const cwd = (typeof req.query.cwd === "string" && req.query.cwd) || projectPathFromName(req.params.name);
  res.json(getServer(cwd));
});

api.get("/projects/:name/logs", (req, res) => {
  const cwd = (typeof req.query.cwd === "string" && req.query.cwd) || projectPathFromName(req.params.name);
  res.json(getLogs(cwd));
});

api.post("/projects/:name/server/start", async (req, res) => {
  try {
    const name = req.params.name;
    const dir = projectPathFromName(name);
    const { cwd, command, branch } = req.body ?? {};
    const workingDir: string = cwd || dir;
    if (!existsSync(workingDir)) {
      return res.status(400).json({ error: `Directory does not exist: ${workingDir}` });
    }
    // Optionally check out a branch in the main repo before starting.
    if (branch && workingDir === dir) {
      try {
        await checkoutBranch(dir, branch);
      } catch (err) {
        return res.status(400).json({ error: `Checkout failed: ${String(err)}` });
      }
    }
    const cmd: string = command || resolveDevCommand(workingDir);
    const server = await startServer({ projectName: name, cwd: workingDir, command: cmd, branch: branch || null });
    res.json(server);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.post("/projects/:name/server/stop", async (req, res) => {
  // `{cwd}` targets a specific working copy; no cwd → the project's main path (backward-compat).
  const { cwd } = req.body ?? {};
  const target: string = cwd || projectPathFromName(req.params.name);
  const stopped = await stopServer(target);
  res.json({ stopped });
});

app.use("/api", api);

// Serve built frontend in production.
const distDir = join(__dirname, "..", "dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => res.sendFile(join(distDir, "index.html")));
}

const httpServer = createServer(app);

// --- WebSocket: live log + status streaming ---
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (ws: WebSocket) => {
  const onLog = (payload: { projectName: string; cwd: string; line: unknown }) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "log", ...payload }));
  };
  const onUpdate = ({ projectName, cwd }: { projectName: string; cwd: string }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "status", projectName, cwd, server: getServer(cwd) }));
    }
  };
  serverEvents.on("log", onLog);
  serverEvents.on("update", onUpdate);
  ws.send(JSON.stringify({ type: "hello", servers: getAllServers() }));
  ws.on("close", () => {
    serverEvents.off("log", onLog);
    serverEvents.off("update", onUpdate);
  });
});

httpServer.listen(PORT, HOST, () => {
  const addr = httpServer.address();
  const port = typeof addr === "object" && addr ? addr.port : PORT;
  // Machine-readable ready line — the Rust port and test harness both key off this.
  console.log(`Kablan.dev listening on http://${HOST}:${port}`);
  const cfg = loadConfig();
  console.log(`  scanning projects in: ${cfg.parentDir}`);
});

function shutdown() {
  killAll();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
