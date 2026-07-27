import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AgentStreamProvider, useAgentStream } from "./useAgentStream.tsx";

const wrap = ({ children }: { children: React.ReactNode }) => <AgentStreamProvider>{children}</AgentStreamProvider>;

describe("useAgentStream", () => {
  it("tracks status + events per key", () => {
    const { result } = renderHook(() => useAgentStream(), { wrapper: wrap });
    act(() => result.current.ingest({ type: "agent-status", key: "p::t1", agent: { key: "p::t1", status: "working", sessionId: null, pid: 1, startedAt: 0, exitCode: null } }));
    act(() => result.current.ingest({ type: "agent-event", key: "p::t1", event: { type: "assistant" } }));
    act(() => result.current.ingest({ type: "log", projectName: "p" })); // ignored
    const a = result.current.agentFor("p::t1");
    expect(a.status).toBe("working");
    expect(a.events).toHaveLength(1);
    expect(result.current.agentFor("nope").events).toHaveLength(0);
  });
});
