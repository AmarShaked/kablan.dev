import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Play,
  Pencil,
  RotateCw,
  GitBranch,
  FolderTree,
  Check,
  ArrowLeftRight,
  DownloadCloud,
  Search,
} from "lucide-react";
import {
  api,
  type ProjectSummary,
  type Branch,
  type Worktree,
  type RunningServer,
} from "../api.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** How many worktrees/branches to show before search is needed. */
const RECENT_LIMIT = 5;

function ListSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-64 max-w-full">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
        placeholder={placeholder}
        spellCheck={false}
        className="h-8 pl-8 text-sm"
      />
    </div>
  );
}

export function OverviewTab({
  project,
  server,
  onStarted,
  onCommandChange,
}: {
  project: ProjectSummary;
  server: RunningServer | null;
  onStarted: () => void;
  onCommandChange: () => void;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);

  const [cwd, setCwd] = useState(project.path);
  const [command, setCommand] = useState(project.devCommand);
  const [editingCmd, setEditingCmd] = useState(false);
  const [cmdDraft, setCmdDraft] = useState(project.devCommand);
  const [busy, setBusy] = useState(false);
  const [gitBusy, setGitBusy] = useState(false);
  const [worktreeQuery, setWorktreeQuery] = useState("");
  const [branchQuery, setBranchQuery] = useState("");

  const reload = useCallback(async () => {
    try {
      const [b, w] = await Promise.all([
        api.getBranches(project.name),
        api.getWorktrees(project.name),
      ]);
      setBranches(b);
      setWorktrees(w);
    } catch (err) {
      toast.error(String(err));
    }
  }, [project.name]);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  const running = server?.status === "running" || server?.status === "starting";
  const currentBranch = branches.find((b) => b.current)?.name ?? project.currentBranch;

  const checkout = async (branch: string) => {
    setGitBusy(true);
    try {
      await api.checkout(project.name, branch);
      toast.success(`Switched to ${branch}`);
      await reload();
      onCommandChange();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setGitBusy(false);
    }
  };

  const pull = async () => {
    setGitBusy(true);
    try {
      const res = await api.pull(project.name);
      toast.success(res.output, { duration: 6000 });
      await reload();
      onCommandChange();
    } catch (err) {
      toast.error(String(err), { duration: 8000 });
    } finally {
      setGitBusy(false);
    }
  };

  const start = async (opts: { cwd?: string; command?: string; branch?: string | null } = {}) => {
    setBusy(true);
    try {
      await api.startServer(project.name, { cwd, command, ...opts });
      toast.success(running ? "Restarted dev server" : "Dev server started");
      onStarted();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveCommand = async () => {
    try {
      const res = await api.setCommand(project.name, cmdDraft.trim());
      setCommand(res.devCommand);
      setEditingCmd(false);
      onCommandChange();
      toast.success("Dev command saved");
    } catch (err) {
      toast.error(String(err));
    }
  };

  const worktreeOptions = worktrees.filter((w) => !w.bare);

  // Show the most recent few by default; searching reveals the rest.
  const wq = worktreeQuery.trim().toLowerCase();
  const worktreesFiltered = wq
    ? worktreeOptions.filter(
        (w) => (w.branch ?? "").toLowerCase().includes(wq) || w.path.toLowerCase().includes(wq),
      )
    : worktreeOptions;
  const worktreesShown = wq ? worktreesFiltered : worktreeOptions.slice(0, RECENT_LIMIT);
  const worktreesHidden = worktreeOptions.length - worktreesShown.length;

  const bq = branchQuery.trim().toLowerCase();
  let branchesShown: Branch[];
  if (bq) {
    branchesShown = branches.filter((b) => b.name.toLowerCase().includes(bq));
  } else {
    // Always keep the current branch visible, pinned first, then fill with the most recent.
    const current = branches.find((b) => b.current);
    const rest = branches.filter((b) => !b.current);
    const head = current ? [current] : [];
    branchesShown = [...head, ...rest.slice(0, RECENT_LIMIT - head.length)];
  }
  const branchesHidden = branches.length - branchesShown.length;

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      {/* Start server */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Start dev server
        </h2>
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label>Working directory (main repo or a worktree)</Label>
            <Select value={cwd} onValueChange={setCwd}>
              <SelectTrigger className="font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={project.path} className="font-mono text-xs">
                  {project.path} (main)
                </SelectItem>
                {worktreeOptions
                  .filter((w) => !w.isMain)
                  .map((w) => (
                    <SelectItem key={w.path} value={w.path} className="font-mono text-xs">
                      {w.path} {w.branch ? `(${w.branch})` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Label>Command</Label>
              {!editingCmd && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={() => {
                    setCmdDraft(command);
                    setEditingCmd(true);
                  }}
                >
                  <Pencil className="size-3" /> edit default
                </Button>
              )}
            </div>
            {editingCmd ? (
              <div className="flex gap-2">
                <Input
                  value={cmdDraft}
                  onChange={(e) => setCmdDraft(e.target.value)}
                  spellCheck={false}
                  className="font-mono text-xs"
                />
                <Button size="sm" onClick={saveCommand}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingCmd(false)}>Cancel</Button>
              </div>
            ) : (
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                spellCheck={false}
                className="font-mono text-xs"
              />
            )}
            {project.detectedCommand && (
              <p className="text-[11px] text-muted-foreground">
                auto-detected: <code className="font-mono">{project.detectedCommand}</code> · pm:{" "}
                {project.packageManager}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={() => start()} disabled={busy}>
              {running ? <RotateCw className="size-4" /> : <Play className="size-4" />}
              {running ? "Restart with this config" : "Start dev server"}
            </Button>
            {running && (
              <span className="text-xs text-muted-foreground">
                Starting stops the current server first.
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Worktrees */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <FolderTree className="size-3.5" /> Worktrees ({worktreeOptions.length})
          </h2>
          {worktreeOptions.length > RECENT_LIMIT && (
            <ListSearch value={worktreeQuery} onChange={setWorktreeQuery} placeholder="Search worktrees…" />
          )}
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : worktreeOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No worktrees.</p>
        ) : worktreesShown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No worktrees match “{worktreeQuery.trim()}”.</p>
        ) : (
          <>
            {worktreesShown.map((w) => (
              <Card key={w.path} className="flex-row items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-mono text-sm">
                    {w.branch ?? (w.detached ? "detached HEAD" : "—")}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">{w.path}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {w.head && <Badge variant="outline" className="font-mono">{w.head}</Badge>}
                  {w.isMain && <Badge className="bg-blue-500/15 text-blue-400 border-0">main</Badge>}
                  {w.locked && <Badge variant="outline">locked</Badge>}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => start({ cwd: w.path, branch: null })}
                  >
                    <Play className="size-3.5" /> Run
                  </Button>
                </div>
              </Card>
            ))}
            {!wq && worktreesHidden > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Showing {RECENT_LIMIT} of {worktreeOptions.length} — search to find the rest.
              </p>
            )}
          </>
        )}
      </section>

      {/* Branches */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <GitBranch className="size-3.5" /> Branches ({branches.length})
          </h2>
          {currentBranch && (
            <Button
              size="sm"
              variant="outline"
              disabled={gitBusy}
              title={`git pull on ${currentBranch}`}
              onClick={pull}
            >
              <DownloadCloud className={cn("size-3.5", gitBusy && "animate-pulse")} />
              Pull {currentBranch}
            </Button>
          )}
        </div>
        {branches.length > RECENT_LIMIT && (
          <ListSearch value={branchQuery} onChange={setBranchQuery} placeholder="Search branches…" />
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : branchesShown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No branches match “{branchQuery.trim()}”.</p>
        ) : (
          branchesShown.map((b) => (
            <Card key={b.name} className="flex-row items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="font-mono text-sm flex items-center gap-2">
                  {b.name}
                  {b.current && (
                    <Badge className="bg-[var(--success)]/15 text-[var(--success)] border-0">
                      <Check className="size-3" /> current
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono truncate">
                  {b.lastCommit} · {b.lastCommitDate}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {b.upstream && <Badge variant="outline" className="font-mono">↑ {b.upstream}</Badge>}
                {!b.current && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={gitBusy || busy}
                    title="Check out this branch in the main repo"
                    onClick={() => checkout(b.name)}
                  >
                    <ArrowLeftRight className="size-3.5" /> Checkout
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  title="Check out this branch in the main repo and start the dev server"
                  onClick={() => start({ cwd: project.path, branch: b.name })}
                >
                  <Play className="size-3.5" /> Run
                </Button>
              </div>
            </Card>
          ))
        )}
        {!bq && branchesHidden > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {branches.some((b) => b.current)
              ? `Showing current + ${branchesShown.length - 1} most recent`
              : `Showing ${branchesShown.length} most recent`}{" "}
            of {branches.length} — search to find the rest.
          </p>
        )}
      </section>
    </div>
  );
}
