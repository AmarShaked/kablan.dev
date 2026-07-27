import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { AgentView, AgentStatus } from "../api.ts";

const MAX = 5000;
type AgentSlice = { status?: AgentStatus; view?: AgentView; events: unknown[] };
type Ctx = {
  ingest: (msg: any) => void;
  agentFor: (key: string) => { status: AgentStatus | undefined; view: AgentView | undefined; events: unknown[] };
};
const AgentStreamCtx = createContext<Ctx | null>(null);

export function AgentStreamProvider({ children }: { children: React.ReactNode }) {
  const [, force] = useState(0);
  const map = useRef(new Map<string, AgentSlice>());
  const ingest = useCallback((msg: any) => {
    if (!msg || (msg.type !== "agent-status" && msg.type !== "agent-event")) return;
    const key = msg.key as string;
    const slice = map.current.get(key) ?? { events: [] };
    if (msg.type === "agent-status") { slice.view = msg.agent; slice.status = msg.agent?.status; }
    else { slice.events = [...slice.events, msg.event]; if (slice.events.length > MAX) slice.events.splice(0, slice.events.length - MAX); }
    map.current.set(key, slice);
    force((n) => n + 1);
  }, []);
  const agentFor = useCallback((key: string) => {
    const s = map.current.get(key);
    return { status: s?.status, view: s?.view, events: s?.events ?? [] };
  }, []);
  return <AgentStreamCtx.Provider value={{ ingest, agentFor }}>{children}</AgentStreamCtx.Provider>;
}

export function useAgentStream() {
  const c = useContext(AgentStreamCtx);
  if (!c) throw new Error("useAgentStream must be used within AgentStreamProvider");
  return c;
}
