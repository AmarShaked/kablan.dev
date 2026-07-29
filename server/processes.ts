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

/** Emits: "update" ({ projectName, cwd }), "log" ({ projectName, cwd, line }). */
export const serverEvents = new EventEmitter();

/**
 * Running servers keyed by their working-copy `cwd` (an absolute, globally-unique
 * path). Multiple working copies of the same project can run concurrently;
 * starting again in the SAME cwd replaces (kill + restart) the server there.
 */
const servers = new Map<string, ServerRecord>();

function publicView(rec: ServerRecord): RunningServer {
  const { child, logs, ...rest } = rec;
  return rest;
}

function emitUpdate(rec: ServerRecord) {
  serverEvents.emit("update", { projectName: rec.projectName, cwd: rec.cwd });
}

function pushLog(rec: ServerRecord, line: LogLine) {
  rec.logs.push(line);
  const max = loadConfig().maxLogLines;
  if (rec.logs.length > max) rec.logs.splice(0, rec.logs.length - max);
  serverEvents.emit("log", { projectName: rec.projectName, cwd: rec.cwd, line });
}

export interface StartOptions {
  projectName: string;
  cwd: string;
  command: string;
  branch?: string | null;
}

export async function startServer(opts: StartOptions): Promise<RunningServer> {
  // One server per working-copy cwd: stop any existing one at this cwd first.
  await stopServer(opts.cwd, { silent: true });

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
  servers.set(opts.cwd, rec);
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
  emitUpdate(rec);

  child.stdout?.on("data", (buf: Buffer) => {
    pushLog(rec, { ts: Date.now(), stream: "stdout", text: buf.toString() });
  });
  child.stderr?.on("data", (buf: Buffer) => {
    pushLog(rec, { ts: Date.now(), stream: "stderr", text: buf.toString() });
  });
  child.on("error", (err) => {
    rec.status = "error";
    pushLog(rec, { ts: Date.now(), stream: "system", text: `Process error: ${err.message}` });
    emitUpdate(rec);
  });
  child.on("exit", (code, signal) => {
    // Only reflect exit if this record is still the active one at this cwd.
    if (servers.get(opts.cwd) === rec) {
      rec.status = rec.status === "starting" ? "error" : "exited";
      rec.exitCode = code;
      rec.pid = null;
      rec.child = null;
      pushLog(rec, {
        ts: Date.now(),
        stream: "system",
        text: `Process exited (code=${code ?? "null"}${signal ? `, signal=${signal}` : ""})`,
      });
      emitUpdate(rec);
    }
  });

  return publicView(rec);
}

export async function stopServer(
  cwd: string,
  { silent = false }: { silent?: boolean } = {},
): Promise<boolean> {
  const rec = servers.get(cwd);
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

export function getServer(cwd: string): RunningServer | null {
  const rec = servers.get(cwd);
  return rec ? publicView(rec) : null;
}

export function getAllServers(): RunningServer[] {
  return [...servers.values()].map(publicView);
}

export function getLogs(cwd: string): LogLine[] {
  return servers.get(cwd)?.logs ?? [];
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
