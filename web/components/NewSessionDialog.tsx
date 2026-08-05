import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../api.ts";
import type { Branch } from "../api.ts";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NewSessionDialogProps {
  project: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Base-branch options — the caller's `useBranches(project)` data. */
  branches: Branch[];
  /** Called with the freshly-generated `session/<hex>` branch name once the session has started. */
  onStarted: (branch: string, message?: string) => void;
}

/** Default base branch: the repo's current branch, else "main" if that isn't in the list either
 * (e.g. branches haven't loaded yet). */
function defaultBase(branches: Branch[]): string {
  return branches.find((b) => b.current)?.name ?? "main";
}

const MAX_SHOWN = 100;

/** Searchable base-branch picker: a repo can have hundreds of branches, so instead of a native
 * <select> that renders them all (slow to open), this is a Popover with a filter box that renders
 * only matching branches, capped at MAX_SHOWN. */
function BaseBranchPicker({
  branches,
  value,
  onChange,
}: {
  branches: Branch[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q ? branches.filter((b) => b.name.toLowerCase().includes(q)) : branches;
  const shown = filtered.slice(0, MAX_SHOWN);

  const pick = (name: string) => {
    onChange(name);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id="new-session-base-branch"
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left font-mono text-xs transition-colors hover:bg-accent"
        >
          <span className="truncate">{value || "Select a branch…"}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <div className="border-b border-border p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search branches…"
            className="h-8 text-sm"
          />
        </div>
        <div className="max-h-64 overflow-y-auto custom-scroll p-1">
          {shown.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">No branches match.</p>
          ) : (
            shown.map((b) => (
              <button
                key={b.name}
                type="button"
                onClick={() => pick(b.name)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors hover:bg-accent",
                  b.name === value && "bg-accent",
                )}
              >
                <Check className={cn("size-3.5 shrink-0 text-primary", b.name === value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{b.name}</span>
                {b.current && (
                  <span className="ml-auto shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">current</span>
                )}
              </button>
            ))
          )}
          {filtered.length > shown.length && (
            <p className="px-2 py-1.5 text-center text-[10px] text-muted-foreground">
              +{filtered.length - shown.length} more — keep typing to narrow
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * "New session" — the Claude-Code-desktop-style flow: pick only a BASE branch to branch off (no
 * existing branch required). Kablan generates the new working branch + worktree and starts its
 * agent server-side (`api.factory.startSession` → `POST .../factory/session`); an optional first
 * message is delivered once the agent's up.
 */
export function NewSessionDialog({ project, open, onOpenChange, branches, onStarted }: NewSessionDialogProps) {
  const [baseBranch, setBaseBranch] = useState(() => defaultBase(branches));
  const [message, setMessage] = useState("");
  const [copyNodeModules, setCopyNodeModules] = useState(true);
  const [copyEnv, setCopyEnv] = useState(true);
  const [busy, setBusy] = useState(false);

  // Re-seed the default whenever the dialog opens (or the branch list changes while it's open) —
  // but keep the user's own choice if it's still a valid option.
  useEffect(() => {
    if (!open) return;
    setBaseBranch((prev) => (branches.some((b) => b.name === prev) ? prev : defaultBase(branches)));
  }, [open, branches]);

  const reset = () => {
    setMessage("");
    setCopyNodeModules(true);
    setCopyEnv(true);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleStart = async () => {
    if (!baseBranch || busy) return;
    setBusy(true);
    try {
      const firstMessage = message.trim() || undefined;
      const { branch } = await api.factory.startSession(project, baseBranch, {
        message: firstMessage,
        copyNodeModules,
        copyEnv,
      });
      onStarted(branch, firstMessage);
      reset();
      handleOpenChange(false);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New session</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-session-base-branch">Base branch</Label>
          <BaseBranchPicker branches={branches} value={baseBranch} onChange={setBaseBranch} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-session-message">First message (optional)</Label>
          <Textarea
            id="new-session-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && baseBranch && !busy) handleStart();
            }}
            placeholder="What should the agent do first? (optional)"
            rows={4}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={copyNodeModules}
              onChange={(e) => setCopyNodeModules(e.target.checked)}
              className="size-4 accent-primary"
            />
            Copy <span className="font-mono text-xs">node_modules</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={copyEnv}
              onChange={(e) => setCopyEnv(e.target.checked)}
              className="size-4 accent-primary"
            />
            Copy <span className="font-mono text-xs">.env</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={!baseBranch || busy}>
            {busy ? "Starting…" : "Start session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
