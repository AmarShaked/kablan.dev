import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { loadConfig } from "./config.ts";

export type ServerStatus = "starting" | "running" | "stopped" | "exited" | "error";

export interface LogLine {
  ts: number;
  stream: "stdout" | "stderr" | "system";
  text: string;
}

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

interface ServerRecord extends RunningServer {
  child: ChildProcess | null;
  logs: LogLine[];
}

/** Emits: "update" (projectName), "log" ({ projectName, line }). */
export const serverEvents = new EventEmitter();

/** One running server per project name — starting a new one replaces the old. */
const servers = new Map<string, ServerRecord>();

function publicView(rec: ServerRecord): RunningServer {
  const { child, logs, ...rest } = rec;
  return rest;
}

function emitUpdate(projectName: string) {
  serverEvents.emit("update", projectName);
}

function pushLog(rec: ServerRecord, line: LogLine) {
  rec.logs.push(line);
  const max = loadConfig().maxLogLines;
  if (rec.logs.length > max) rec.logs.splice(0, rec.logs.length - max);
  serverEvents.emit("log", { projectName: rec.projectName, line });
}

export interface StartOptions {
  projectName: string;
  cwd: string;
  command: string;
  branch?: string | null;
}

export async function startServer(opts: StartOptions): Promise<RunningServer> {
  // Enforce single-server-per-project: stop any existing one first.
  await stopServer(opts.projectName, { silent: true });

  const rec: ServerRecord = {
    projectName: opts.projectName,
    cwd: opts.cwd,
    command: opts.command,
    branch: opts.branch ?? null,
    pid: null,
    status: "starting",
    startedAt: Date.now(),
    exitCode: null,
    child: null,
    logs: [],
  };
  servers.set(opts.projectName, rec);
  pushLog(rec, { ts: Date.now(), stream: "system", text: `$ ${opts.command}  (cwd: ${opts.cwd})` });

  // Run through the shell so commands like "npm run dev" work as typed.
  const child = spawn(opts.command, {
    cwd: opts.cwd,
    shell: true,
    // Ask tools to emit plain output; we render logs as text, not a TTY.
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    detached: true, // own process group so we can kill the whole tree
  });
  rec.child = child;
  rec.pid = child.pid ?? null;
  rec.status = "running";
  emitUpdate(opts.projectName);

  child.stdout?.on("data", (buf: Buffer) => {
    pushLog(rec, { ts: Date.now(), stream: "stdout", text: buf.toString() });
  });
  child.stderr?.on("data", (buf: Buffer) => {
    pushLog(rec, { ts: Date.now(), stream: "stderr", text: buf.toString() });
  });
  child.on("error", (err) => {
    rec.status = "error";
    pushLog(rec, { ts: Date.now(), stream: "system", text: `Process error: ${err.message}` });
    emitUpdate(opts.projectName);
  });
  child.on("exit", (code, signal) => {
    // Only reflect exit if this record is still the active one.
    if (servers.get(opts.projectName) === rec) {
      rec.status = rec.status === "starting" ? "error" : "exited";
      rec.exitCode = code;
      rec.pid = null;
      rec.child = null;
      pushLog(rec, {
        ts: Date.now(),
        stream: "system",
        text: `Process exited (code=${code ?? "null"}${signal ? `, signal=${signal}` : ""})`,
      });
      emitUpdate(opts.projectName);
    }
  });

  return publicView(rec);
}

export async function stopServer(
  projectName: string,
  { silent = false }: { silent?: boolean } = {},
): Promise<boolean> {
  const rec = servers.get(projectName);
  if (!rec || !rec.child || rec.pid == null) return false;

  const pid = rec.pid;
  if (!silent) pushLog(rec, { ts: Date.now(), stream: "system", text: "Stopping server..." });

  return new Promise((resolve) => {
    const child = rec.child!;
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    child.once("exit", () => done(true));

    try {
      // Kill the whole process group (negative pid) started via detached.
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }

    // Escalate to SIGKILL if it lingers.
    setTimeout(() => {
      if (!settled) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          /* ignore */
        }
        done(true);
      }
    }, 4000);
  });
}

export function getServer(projectName: string): RunningServer | null {
  const rec = servers.get(projectName);
  return rec ? publicView(rec) : null;
}

export function getAllServers(): RunningServer[] {
  return [...servers.values()].map(publicView);
}

export function getLogs(projectName: string): LogLine[] {
  return servers.get(projectName)?.logs ?? [];
}

/** Best-effort cleanup of all child servers on shutdown. */
export function killAll() {
  for (const rec of servers.values()) {
    if (rec.pid != null) {
      try {
        process.kill(-rec.pid, "SIGKILL");
      } catch {
        /* ignore */
      }
    }
  }
}
