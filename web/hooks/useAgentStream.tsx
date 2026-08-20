import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { AgentView, AgentStatus, AgentApproval } from "../api.ts";

const MAX = 5000;
type AgentSlice = {
  status?: AgentStatus;
  view?: AgentView;
  events: unknown[];
  approvals: AgentApproval[];
  /** When the current "working" turn began (ms epoch), set on the transition into "working" and
   * cleared when it leaves. Lives here (not in AgentChat) so the elapsed timer survives the
   * unmount/remount of a branch switch — the store persists while AgentChat comes and goes. */
  workingSince?: number;
};
type Ctx = {
  ingest: (msg: any) => void;
  agentFor: (
    key: string,
  ) => {
    status: AgentStatus | undefined;
    view: AgentView | undefined;
    events: unknown[];
    approvals: AgentApproval[];
    workingSince: number | undefined;
  };
  /** Merges backfilled outstanding approvals (from `getAgent`) into a key's pending set, deduping
   * by id — so a reopened/remounted cockpit re-shows gates that arrived before it was listening. */
  seedApprovals: (key: string, approvals: AgentApproval[]) => void;
  unread: (key: string) => number;
  unreadForProject: (project: string) => number;
  markRead: (key: string) => void;
  setActiveKey: (key: string | null) => void;
  /** Bumps on every ingest — a cheap dependency for effects that need to
   * re-scan `snapshotStatuses()` (e.g. desktop-notification transition
   * tracking) without threading individual keys through. */
  version: number;
  /** Current status of every key known to the stream, as of this render. */
  snapshotStatuses: () => Record<string, AgentStatus>;
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
  const [version, force] = useState(0);
  const map = useRef(new Map<string, AgentSlice>());
  const unreadMap = useRef(new Map<string, number>());
  const activeKeyRef = useRef<string | null>(null);

  const ingest = useCallback((msg: any) => {
    if (
      !msg ||
      (msg.type !== "agent-status" &&
        msg.type !== "agent-event" &&
        msg.type !== "agent-approval" &&
        msg.type !== "agent-approval-resolved")
    )
      return;
    const key = msg.key as string;
    if (msg.type === "agent-event" && isNoiseEvent(msg.event)) return;
    const slice = map.current.get(key) ?? { events: [], approvals: [] };
    if (msg.type === "agent-status") {
      const prev = slice.status;
      const next = msg.agent?.status;
      slice.view = msg.agent;
      slice.status = next;
      // Anchor the working-turn start on the transition INTO working; keep it steady while it
      // stays working (so a re-render doesn't restart it); clear it once it leaves.
      if (next === "working") {
        if (prev !== "working") slice.workingSince = Date.now();
      } else {
        slice.workingSince = undefined;
      }
    } else if (msg.type === "agent-approval") {
      // A new pending gate for this key — append unless we already hold its id.
      const appr = msg.approval as AgentApproval | undefined;
      if (appr && !slice.approvals.some((a) => a.id === appr.id)) {
        slice.approvals = [...slice.approvals, appr];
      }
    } else if (msg.type === "agent-approval-resolved") {
      // The backend decided (or a client resolved it) — drop it from the pending set.
      slice.approvals = slice.approvals.filter((a) => a.id !== msg.approvalId);
    } else {
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
    return {
      status: s?.status,
      view: s?.view,
      events: s?.events ?? [],
      approvals: s?.approvals ?? [],
      workingSince: s?.workingSince,
    };
  }, []);

  const seedApprovals = useCallback((key: string, approvals: AgentApproval[]) => {
    if (!approvals || approvals.length === 0) return;
    const slice = map.current.get(key) ?? { events: [], approvals: [] };
    const seen = new Set(slice.approvals.map((a) => a.id));
    const merged = [...slice.approvals];
    for (const a of approvals) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        merged.push(a);
      }
    }
    slice.approvals = merged;
    map.current.set(key, slice);
    force((n) => n + 1);
  }, []);

  const snapshotStatuses = useCallback((): Record<string, AgentStatus> => {
    const out: Record<string, AgentStatus> = {};
    for (const [key, slice] of map.current) {
      if (slice.status) out[key] = slice.status;
    }
    return out;
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

  return (
    <AgentStreamCtx.Provider
      value={{ ingest, agentFor, seedApprovals, unread, unreadForProject, markRead, setActiveKey, version, snapshotStatuses }}
    >
      {children}
    </AgentStreamCtx.Provider>
  );
}

export function useAgentStream() {
  const c = useContext(AgentStreamCtx);
  if (!c) throw new Error("useAgentStream must be used within AgentStreamProvider");
  return c;
}
