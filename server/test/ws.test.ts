import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import WebSocket from "ws";
import { startServer, initRepo } from "./harness.ts";

const IDLE_CMD = `node -e "console.log('hi'); setInterval(()=>{}, 1000)"`;

/** Collects incoming JSON messages and lets tests await one matching a predicate. */
class WsCollector {
  ws: WebSocket;
  messages: any[] = [];
  private waiters: { pred: (m: any) => boolean; resolve: (m: any) => void }[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      this.messages.push(msg);
      this.waiters = this.waiters.filter((w) => {
        if (w.pred(msg)) {
          w.resolve(msg);
          return false;
        }
        return true;
      });
    });
  }
  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.on("open", () => resolve());
      this.ws.on("error", reject);
    });
  }
  waitFor(pred: (m: any) => boolean, ms = 10_000): Promise<any> {
    const existing = this.messages.find(pred);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for ws message")), ms);
      this.waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }
  close() {
    this.ws.close();
  }
}

describe("WebSocket /ws", () => {
  test("sends a 'hello' with the current servers on connect", async () => {
    const s = await startServer();
    const c = new WsCollector(s.wsUrl);
    try {
      await c.open();
      const hello = await c.waitFor((m) => m.type === "hello");
      assert.ok(Array.isArray(hello.servers));
      assert.equal(hello.servers.length, 0);
    } finally {
      c.close();
      await s.stop();
    }
  });

  test("streams status + log events when a server starts, and status on stop", async () => {
    const s = await startServer();
    const main = join(s.workspace, "repo");
    await initRepo(main);
    const c = new WsCollector(s.wsUrl);
    try {
      await c.open();
      await c.waitFor((m) => m.type === "hello");

      await s.api.post("/api/projects/repo/server/start", { command: IDLE_CMD });

      const status = await c.waitFor(
        (m) => m.type === "status" && m.projectName === "repo" && m.server,
      );
      assert.ok(["starting", "running"].includes(status.server.status));

      const log = await c.waitFor(
        (m) => m.type === "log" && m.projectName === "repo" && m.line?.text,
      );
      assert.ok(["system", "stdout", "stderr"].includes(log.line.stream));

      await s.api.post("/api/projects/repo/server/stop", {});
      const stopped = await c.waitFor(
        (m) =>
          m.type === "status" &&
          m.projectName === "repo" &&
          m.server &&
          m.server.status !== "running" &&
          m.server.status !== "starting",
      );
      assert.ok(stopped.server.status === "exited" || stopped.server.status === "stopped");
    } finally {
      c.close();
      await s.api.post("/api/projects/repo/server/stop", {}).catch(() => {});
      await s.stop();
    }
  });
});
