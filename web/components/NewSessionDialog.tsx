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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface NewSessionDialogProps {
  project: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Base-branch options — the caller's `useBranches(project)` data. */
  branches: Branch[];
  /** Called with the freshly-generated `session/<hex>` branch name once the session has started. */
  onStarted: (branch: string) => void;
}

/** Default base branch: the repo's current branch, else "main" if that isn't in the list either
 * (e.g. branches haven't loaded yet). */
function defaultBase(branches: Branch[]): string {
  return branches.find((b) => b.current)?.name ?? "main";
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
  const [busy, setBusy] = useState(false);

  // Re-seed the default whenever the dialog opens (or the branch list changes while it's open) —
  // but keep the user's own choice if it's still a valid option.
  useEffect(() => {
    if (!open) return;
    setBaseBranch((prev) => (branches.some((b) => b.name === prev) ? prev : defaultBase(branches)));
  }, [open, branches]);

  const reset = () => setMessage("");

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleStart = async () => {
    if (!baseBranch || busy) return;
    setBusy(true);
    try {
      const { branch } = await api.factory.startSession(project, baseBranch, message.trim() || undefined);
      onStarted(branch);
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
          <Select value={baseBranch} onValueChange={setBaseBranch}>
            <SelectTrigger id="new-session-base-branch" className="w-full font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.name} value={b.name} className="font-mono text-xs">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
