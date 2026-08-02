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

  it("skips storing noisy stream_event/system deltas but keeps real transcript events", () => {
    const { result } = renderHook(() => useAgentStream(), { wrapper: wrap });
    act(() => result.current.ingest({ type: "agent-event", key: "p::t1", event: { type: "stream_event", event: { type: "content_block_delta" } } }));
    act(() => result.current.ingest({ type: "agent-event", key: "p::t1", event: { type: "system", subtype: "thinking_tokens" } }));
    act(() => result.current.ingest({ type: "agent-event", key: "p::t1", event: { type: "system", subtype: "hook_started" } }));
    act(() => result.current.ingest({ type: "agent-event", key: "p::t1", event: { type: "system", subtype: "hook_response" } }));
    act(() => result.current.ingest({ type: "agent-event", key: "p::t1", event: { type: "system", subtype: "status" } }));
    expect(result.current.agentFor("p::t1").events).toHaveLength(0);

    // system spawn_error/stderr are rendered by the cockpit, so they must still be kept.
    act(() => result.current.ingest({ type: "agent-event", key: "p::t1", event: { type: "system", subtype: "spawn_error", message: "boom" } }));
    expect(result.current.agentFor("p::t1").events).toHaveLength(1);

    act(() => result.current.ingest({ type: "agent-event", key: "p::t1", event: { type: "assistant" } }));
    expect(result.current.agentFor("p::t1").events).toHaveLength(2);
  });

  it("retains user/tool_result events so the renderer can fold results onto tool lines", () => {
    const { result } = renderHook(() => useAgentStream(), { wrapper: wrap });
    act(() =>
      result.current.ingest({
        type: "agent-event",
        key: "p::t1",
        event: { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: "ok" }] } },
      }),
    );
    expect(result.current.agentFor("p::t1").events).toHaveLength(1);
  });

  it("tracks pending approvals per key: adds on agent-approval, removes on resolved", () => {
    const { result } = renderHook(() => useAgentStream(), { wrapper: wrap });
    const appr = { id: "appr-1", toolName: "Bash", input: { command: "ls" }, createdAt: 1 };
    act(() => result.current.ingest({ type: "agent-approval", key: "p::t1", approval: appr }));
    expect(result.current.agentFor("p::t1").approvals).toEqual([appr]);
    // Duplicate id → no double-add.
    act(() => result.current.ingest({ type: "agent-approval", key: "p::t1", approval: appr }));
    expect(result.current.agentFor("p::t1").approvals).toHaveLength(1);
    // Resolution removes it.
    act(() =>
      result.current.ingest({ type: "agent-approval-resolved", key: "p::t1", approvalId: "appr-1", decision: "allow" }),
    );
    expect(result.current.agentFor("p::t1").approvals).toHaveLength(0);
  });

  it("seedApprovals merges backfilled approvals without duplicating ids", () => {
    const { result } = renderHook(() => useAgentStream(), { wrapper: wrap });
    const a1 = { id: "appr-1", toolName: "Bash", input: {}, createdAt: 1 };
    const a2 = { id: "appr-2", toolName: "Edit", input: {}, createdAt: 2 };
    act(() => result.current.ingest({ type: "agent-approval", key: "p::t1", approval: a1 }));
    act(() => result.current.seedApprovals("p::t1", [a1, a2]));
    const ids = result.current.agentFor("p::t1").approvals.map((a) => a.id);
    expect(ids).toEqual(["appr-1", "appr-2"]);
  });

  it("tracks unread, respects active key, and sums per project", () => {
    const { result } = renderHook(() => useAgentStream(), { wrapper: wrap });
    const ev = (key: string) => ({ type: "agent-event", key, event: { type: "assistant" } });
    act(() => result.current.ingest(ev("p::t1")));
    act(() => result.current.ingest(ev("p::t1")));
    act(() => result.current.ingest(ev("p::t2")));
    expect(result.current.unread("p::t1")).toBe(2);
    expect(result.current.unreadForProject("p")).toBe(3);
    act(() => result.current.markRead("p::t1"));
    expect(result.current.unread("p::t1")).toBe(0);
    act(() => result.current.setActiveKey("p::t2"));
    act(() => result.current.ingest(ev("p::t2"))); // active → no unread
    expect(result.current.unread("p::t2")).toBe(0);
  });
});
