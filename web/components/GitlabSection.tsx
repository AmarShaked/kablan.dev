import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, GitMerge } from "lucide-react";
import { api } from "../api.ts";
import { useGitlabOverview } from "../queries.ts";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

  const submit = async () => {
    if (!branch || !title.trim()) return;
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
        action: { label: "Open", onClick: () => api.gitlab.status(project).then(() => window.open(r.webUrl, "_blank")) },
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
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">GitLab</h3>
      {data.error && <p className="text-xs text-rose-500">{data.error}</p>}

      {mr ? (
        <a
          href={mr.webUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent/50"
        >
          <GitMerge className="size-4 text-orange-500" />
          <span className="truncate">
            !{mr.iid} {mr.title}
          </span>
          <span className={cn("ml-auto shrink-0 text-xs", pipelineTone(mr.pipelineStatus))}>
            {mr.draft ? "draft" : mr.state}
            {mr.pipelineStatus ? ` · ${mr.pipelineStatus}` : ""}
          </span>
        </a>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>No open MR for this branch.</span>
          {status && <span className={cn("text-xs", pipelineTone(status))}>CI: {status}</span>}
        </div>
      )}

      {pipeline && (
        <a href={pipeline.webUrl} target="_blank" rel="noreferrer" className={cn("text-xs hover:underline", pipelineTone(pipeline.status))}>
          Pipeline: {pipeline.status} ↗
        </a>
      )}

      {branch && !mr && !showForm && (
        <Button size="sm" variant="outline" className="self-start" onClick={() => { setTitle(branch); setTarget(defaultTarget); setShowForm(true); }}>
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
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="min-h-[80px] text-sm" />
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Draft
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={removeSource} onChange={(e) => setRemoveSource(e.target.checked)} /> Delete source branch
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={creating || !title.trim()} onClick={submit}>
              {creating ? "Creating…" : "Create MR"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
