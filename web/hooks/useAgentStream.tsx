import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { AgentView, AgentStatus } from "../api.ts";

const MAX = 5000;
type AgentSlice = { status?: AgentStatus; view?: AgentView; events: unknown[] };
type Ctx = {
  ingest: (msg: any) => void;
  agentFor: (key: string) => { status: AgentStatus | undefined; view: AgentView | undefined; events: unknown[] };
  unread: (key: string) => number;
  unreadForProject: (project: string) => number;
  markRead: (key: string) => void;
  setActiveKey: (key: string | null) => void;
};
const AgentStreamCtx = createContext<Ctx | null>(null);

// `system` subtypes that are pure noise — renderEvent (TaskForceCockpit) discards them too.
// spawn_error/stderr are deliberately excluded: the cockpit renders those as error lines.
const NOISY_SYSTEM_SUBTYPES = new Set(["thinking_tokens", "hook_started", "hook_response", "status"]);

/** True when an agent-event's inner event is discarded by renderEvent anyway, so storing it
 * would only cost memory/rerenders and crowd real transcript events out of the MAX-sized ring
 * buffer (the agent runs with --include-partial-messages, which floods stream_event deltas). */
function isNoiseEvent(event: any): boolean {
  if (!event || typeof event !== "object") return false;
  if (event.type === "stream_event") return true;
  if (event.type === "system" && NOISY_SYSTEM_SUBTYPES.has(event.subtype)) return true;
  return false;
}

export function AgentStreamProvider({ children }: { children: React.ReactNode }) {
  const [, force] = useState(0);
  const map = useRef(new Map<string, AgentSlice>());
  const unreadMap = useRef(new Map<string, number>());
  const activeKeyRef = useRef<string | null>(null);

  const ingest = useCallback((msg: any) => {
    if (!msg || (msg.type !== "agent-status" && msg.type !== "agent-event")) return;
    const key = msg.key as string;
    if (msg.type === "agent-event" && isNoiseEvent(msg.event)) return;
    const slice = map.current.get(key) ?? { events: [] };
    if (msg.type === "agent-status") { slice.view = msg.agent; slice.status = msg.agent?.status; }
    else {
      slice.events = [...slice.events, msg.event];
      if (slice.events.length > MAX) slice.events.splice(0, slice.events.length - MAX);
      // Increment unread only if this is a non-noise agent-event and not the active key
      if (key !== activeKeyRef.current) {
        unreadMap.current.set(key, (unreadMap.current.get(key) ?? 0) + 1);
      }
    }
    map.current.set(key, slice);
    force((n) => n + 1);
  }, []);

  const agentFor = useCallback((key: string) => {
    const s = map.current.get(key);
    return { status: s?.status, view: s?.view, events: s?.events ?? [] };
  }, []);

  const unread = useCallback((key: string) => {
    return unreadMap.current.get(key) ?? 0;
  }, []);

  const unreadForProject = useCallback((project: string) => {
    let sum = 0;
    for (const [k, count] of unreadMap.current) {
      if (k.startsWith(`${project}::`)) {
        sum += count;
      }
    }
    return sum;
  }, []);

  const markRead = useCallback((key: string) => {
    unreadMap.current.set(key, 0);
    force((n) => n + 1);
  }, []);

  const setActiveKey = useCallback((key: string | null) => {
    activeKeyRef.current = key;
    if (key !== null) {
      unreadMap.current.set(key, 0);
    }
    force((n) => n + 1);
  }, []);

  return <AgentStreamCtx.Provider value={{ ingest, agentFor, unread, unreadForProject, markRead, setActiveKey }}>{children}</AgentStreamCtx.Provider>;
}

export function useAgentStream() {
  const c = useContext(AgentStreamCtx);
  if (!c) throw new Error("useAgentStream must be used within AgentStreamProvider");
  return c;
}
