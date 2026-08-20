import { useState } from "react";
import { toast } from "sonner";
import { GitMerge, ExternalLink } from "lucide-react";
import { GitLabLogo } from "../lib/brandLogos.tsx";
import { api, type GitlabMergeRequest } from "../api.ts";
import { useGitlabOverview } from "../queries.ts";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { openExternal } from "../lib/openExternal.ts";

/** Tailwind text color for a pipeline/CI status. */
export function pipelineTone(status: string | null): string {
  switch (status) {
    case "success":
      return "text-emerald-600 dark:text-emerald-400";
    case "failed":
      return "text-rose-600 dark:text-rose-400";
    case "running":
    case "pending":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "text-muted-foreground";
  }
}

/** One merge-request row, linking out to the MR on the GitLab host. */
function MrRow({ mr }: { mr: GitlabMergeRequest }) {
  return (
    <a
      href={mr.webUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent/50"
    >
      <GitMerge className="size-4 shrink-0 text-orange-500" />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-muted-foreground">!{mr.iid}</span> {mr.title}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs">
        {mr.approvalsRequired != null && (
          <span className="text-muted-foreground">
            {(mr.approvalsRequired - (mr.approvalsLeft ?? 0))}/{mr.approvalsRequired} ✓
          </span>
        )}
        <span className={pipelineTone(mr.pipelineStatus)}>
          {mr.draft ? "draft" : mr.state}
          {mr.pipelineStatus ? ` · ${mr.pipelineStatus}` : ""}
        </span>
      </span>
    </a>
  );
}

export function GitlabSection({
  project,
  branch,
  defaultTarget,
}: {
  project: string;
  branch: string | null;
  defaultTarget: string;
}) {
  const qc = useQueryClient();
  const ov = useGitlabOverview(project);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState(defaultTarget);
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState(false);
  const [removeSource, setRemoveSource] = useState(true);

  if (!ov.data || !ov.data.connected) return null; // hidden unless connected
  const data = ov.data;
  const mr = branch ? data.mrs.find((m) => m.sourceBranch === branch) : undefined;
  const pipeline = branch ? data.pipelines.find((p) => p.ref === branch) : undefined;
  const status = mr?.pipelineStatus ?? pipeline?.status ?? null;
  const projectUrl = data.host && data.project ? `https://${data.host}/${data.project}` : null;

  const submit = async () => {
    if (!branch || !title.trim() || !target.trim()) return;
    if (target.trim() === branch) {
      toast.error("Source and target branch are the same.");
      return;
    }
    setCreating(true);
    try {
      const r = await api.gitlab.createMr(project, {
        sourceBranch: branch,
        targetBranch: target,
        title: title.trim(),
        description,
        draft,
        removeSourceBranch: removeSource,
      });
      toast.success(`Created MR !${r.iid}`, {
        duration: 8000,
        action: { label: "Open", onClick: () => void openExternal(r.webUrl) },
      });
      setShowForm(false);
      setTitle("");
      qc.invalidateQueries({ queryKey: ["gitlab-overview", project] });
    } catch (err) {
      toast.error(`Create MR failed: ${String(err)}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Project header */}
      <a
        href={projectUrl ?? "#"}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent/50"
      >
        <GitLabLogo className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-mono">{data.project}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{data.host}</span>
        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
      </a>

      {data.error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
          {data.error}
        </p>
      )}

      {/* This branch */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          This branch
        </h3>
        {branch ? (
          <p className="font-mono text-xs text-muted-foreground">{branch}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No branch for this entry.</p>
        )}

        {mr ? (
          <MrRow mr={mr} />
        ) : (
          branch && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>No open MR for this branch.</span>
              {status && <span className={cn("text-xs", pipelineTone(status))}>CI: {status}</span>}
            </div>
          )
        )}

        {pipeline && (
          <a
            href={pipeline.webUrl}
            target="_blank"
            rel="noreferrer"
            className={cn("text-xs hover:underline", pipelineTone(pipeline.status))}
          >
            Pipeline: {pipeline.status} ↗
          </a>
        )}

        {branch && !mr && !showForm && (
          <Button
            size="xs"
            variant="outline"
            className="self-start"
            onClick={() => {
              setTitle(branch);
              setTarget(defaultTarget);
              setShowForm(true);
            }}
          >
            <GitMerge className="size-3.5" /> Create MR
          </Button>
        )}

        {showForm && (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="MR title" className="text-sm" />
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{branch}</span>
              <span className="text-muted-foreground">→</span>
              <Input value={target} onChange={(e) => setTarget(e.target.value)} className="h-7 w-40 font-mono text-xs" />
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="min-h-[80px] text-sm"
            />
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Draft
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={removeSource} onChange={(e) => setRemoveSource(e.target.checked)} /> Delete
                source branch
              </label>
            </div>
            <div className="flex gap-2">
              <Button size="xs" disabled={creating || !title.trim() || !target.trim()} onClick={submit}>
                {creating ? "Creating…" : "Create MR"}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
