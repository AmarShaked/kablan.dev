import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { api, type ProjectSummary, type EnvFile, type RunningServer } from "../api.ts";
import { useWorktrees } from "../queries.ts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function EnvTab({
  project,
  server,
  defaultCwd,
  lockDirectory = false,
}: {
  project: ProjectSummary;
  server: RunningServer | null;
  defaultCwd?: string;
  /** When true, edit only defaultCwd's env (no directory picker) — used in the item drawer. */
  lockDirectory?: boolean;
}) {
  // Default to the item's directory (drawer), else the running server's dir, else main.
  const [cwd, setCwd] = useState(defaultCwd || server?.cwd || project.path);
  const worktrees = useWorktrees(project.name).data ?? [];
  const [files, setFiles] = useState<EnvFile[]>([]);
  const [active, setActive] = useState(0);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .getEnv(project.name, cwd)
      .then((f) => {
        setFiles(f);
        const idx = f.findIndex((x) => x.exists);
        const start = idx >= 0 ? idx : 0;
        setActive(start);
        setDraft(f[start]?.content ?? "");
        setDirty(false);
      })
      .catch((err) => toast.error(String(err)))
      .finally(() => setLoading(false));
  }, [project.name, cwd]);

  const changeCwd = (next: string) => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    setCwd(next);
  };

  const selectFile = (i: number) => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    setActive(i);
    setDraft(files[i]?.content ?? "");
    setDirty(false);
  };

  const save = async () => {
    const file = files[active];
    setSaving(true);
    try {
      await api.saveEnv(project.name, file.name, draft, cwd);
      setFiles((prev) => prev.map((f, i) => (i === active ? { ...f, content: draft, exists: true } : f)));
      setDirty(false);
      toast.success(`Saved ${file.name}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const worktreeOptions = worktrees.filter((w) => !w.bare && !w.isMain);
  const runningHere = server?.cwd === cwd && (server?.status === "running" || server?.status === "starting");

  const file = files[active];

  return (
    <div className="flex flex-col gap-3 max-w-4xl">
      {!lockDirectory && (
        <div className="grid gap-2">
          <Label>Directory (each worktree has its own env files)</Label>
          <Select value={cwd} onValueChange={changeCwd}>
            <SelectTrigger className="font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={project.path} className="font-mono text-xs">
                {project.path} (main)
              </SelectItem>
              {worktreeOptions.map((w) => (
                <SelectItem key={w.path} value={w.path} className="font-mono text-xs">
                  {w.path} {w.branch ? `(${w.branch})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {server && (
            <p className="text-[11px] text-muted-foreground">
              {runningHere
                ? "✓ This is the directory your dev server is running in."
                : `Heads up: your dev server is running in ${server.cwd} — select it to edit the env it loads.`}
            </p>
          )}
        </div>
      )}

      {loading ? (
        <>
          <div className="flex flex-wrap gap-2">
            {[16, 20, 24, 28].map((w, i) => (
              <Skeleton key={i} className="h-[30px] rounded-md" style={{ width: `${w * 4}px` }} />
            ))}
          </div>
          <Skeleton className="min-h-[360px] w-full rounded-lg" />
        </>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted-foreground">No env files configured. Add some in Settings.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <button
                key={f.name}
                onClick={() => selectFile(i)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-mono transition-colors",
                  i === active
                    ? "border-primary text-foreground bg-accent"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {f.name}
                {!f.exists && <span className="ml-1 italic opacity-60">(new)</span>}
              </button>
            ))}
          </div>

          <Textarea
            value={draft}
            spellCheck={false}
            placeholder={`# ${file.name} is empty. Add KEY=value lines here.`}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            className="font-mono text-[13px] min-h-[360px] leading-relaxed"
          />

          <div className="flex items-center gap-3">
            <Button size="xs" onClick={save} disabled={!dirty || saving}>
              <Save className="size-3.5" />
              {saving ? "Saving…" : `Save ${file.name}`}
            </Button>
            {dirty ? (
              <span className="text-xs text-[var(--warning)]">Unsaved changes</span>
            ) : (
              file.exists && <span className="text-xs text-[var(--success)]">Saved</span>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground">
              Restart the dev server for changes to take effect.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
