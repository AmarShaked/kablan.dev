import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AgentStreamProvider, useAgentStream } from "./useAgentStream.tsx";
import { useAgentNotifications } from "./useAgentNotifications.tsx";
import type { NotificationSettings } from "../api.ts";

const wrap = ({ children }: { children: React.ReactNode }) => <AgentStreamProvider>{children}</AgentStreamProvider>;

const cfg = (overrides: Partial<NotificationSettings> = {}): NotificationSettings => ({
  enabled: true,
  events: ["awaitingInput", "failed", "done"],
  ...overrides,
});

const statusMsg = (key: string, status: string) => ({
  type: "agent-status",
  key,
  agent: { key, status, sessionId: null, pid: null, startedAt: 0, exitCode: null },
});

function setup(notifications: NotificationSettings, nameFor?: (key: string) => string | undefined) {
  const send = vi.fn();
  const { result } = renderHook(
    () => {
      const stream = useAgentStream();
      useAgentNotifications(notifications, nameFor, send);
      return stream;
    },
    { wrapper: wrap },
  );
  return { result, send };
}

describe("useAgentNotifications", () => {
  it("notifies on a qualifying transition", () => {
    const { result, send } = setup(cfg());
    act(() => result.current.ingest(statusMsg("p::t1", "working")));
    expect(send).not.toHaveBeenCalled(); // "working" isn't in cfg.events

    act(() => result.current.ingest(statusMsg("p::t1", "awaitingInput")));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].title).toBe("p::t1 needs attention");
  });

  it("does not notify again for a repeated status (no repeats)", () => {
    const { result, send } = setup(cfg());
    act(() => result.current.ingest(statusMsg("p::t1", "awaitingInput")));
    act(() => result.current.ingest(statusMsg("p::t1", "awaitingInput")));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not notify when notifications are disabled", () => {
    const { result, send } = setup(cfg({ enabled: false }));
    act(() => result.current.ingest(statusMsg("p::t1", "failed")));
    expect(send).not.toHaveBeenCalled();
  });

  it("does not notify for a status not in cfg.events", () => {
    const { result, send } = setup(cfg({ events: ["failed"] }));
    act(() => result.current.ingest(statusMsg("p::t1", "awaitingInput")));
    expect(send).not.toHaveBeenCalled();
  });

  it("tracks transitions per key independently", () => {
    const { result, send } = setup(cfg());
    act(() => result.current.ingest(statusMsg("p::t1", "failed")));
    act(() => result.current.ingest(statusMsg("p::t2", "done")));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("uses nameFor to build the title, falling back to the raw key", () => {
    const { result, send } = setup(cfg(), (key) => (key === "p::t1" ? "My Task Force" : undefined));
    act(() => result.current.ingest(statusMsg("p::t1", "done")));
    expect(send.mock.calls[0][0].title).toBe("My Task Force needs attention");

    act(() => result.current.ingest(statusMsg("p::t2", "done")));
    expect(send.mock.calls[1][0].title).toBe("p::t2 needs attention");
  });
});
