import { useFactory } from "../queries.ts";
import { useAgentStream } from "../hooks/useAgentStream.tsx";
import { AgentDot } from "./FactorySidebar.tsx";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { AgentStatus } from "../api.ts";

/** One tile in the metric strip — a big number over a small label. */
function MetricTile({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-1 rounded-lg border border-border p-3"
    >
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function FeaturePage({
  project,
  featureId,
  onOpenTaskForce,
}: {
  project: string;
  featureId: string | null;
  onOpenTaskForce: (featureId: string, taskForceId: string) => void;
}) {
  const { data } = useFactory(project);
  const feature = featureId ? data?.features.find((f) => f.id === featureId) : undefined;
  const { agentFor } = useAgentStream();

  if (!feature) {
    return (
      <>
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <SidebarTrigger className="shrink-0" />
          <h1 className="text-lg font-semibold">Feature</h1>
        </div>
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Feature not found.
        </div>
      </>
    );
  }

  const statusFor = (taskForceId: string) => agentFor(`${project}::${taskForceId}`).status;
  const statuses = feature.taskForces.map((tf) => statusFor(tf.id));
  const countBy = (status: AgentStatus) => statuses.filter((s) => s === status).length;

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <SidebarTrigger className="shrink-0" />
        <h1 className="truncate text-lg font-semibold">{feature.name}</h1>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto custom-scroll p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile testId="metric-task-forces" label="Task forces" value={feature.taskForces.length} />
          <MetricTile testId="metric-working" label="Working" value={countBy("working")} />
          <MetricTile testId="metric-awaiting-input" label="Awaiting input" value={countBy("awaitingInput")} />
          <MetricTile testId="metric-failed" label="Failed" value={countBy("failed")} />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Task forces
          </h2>
          {feature.taskForces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No task forces yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {feature.taskForces.map((tf) => (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => onOpenTaskForce(feature.id, tf.id)}
                  className="flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <AgentDot status={statusFor(tf.id)} />
                  <span className="truncate">{tf.name}</span>
                  <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
                    {tf.branch}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent activity
          </h2>
          <p className="text-sm text-muted-foreground">Coming soon.</p>
        </div>
      </div>
    </>
  );
}
