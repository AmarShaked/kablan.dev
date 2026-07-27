import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { api, type TaskForce } from "../api.ts";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export function CreateTaskForceDialog({
  project,
  featureId,
  open,
  onOpenChange,
  onCreated,
}: {
  project: string;
  featureId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (taskForce: TaskForce) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [linearTicket, setLinearTicket] = useState("");
  const [prompt, setPrompt] = useState("");
  const [start, setStart] = useState(true);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setBaseBranch("");
    setLinearTicket("");
    setPrompt("");
    setStart(true);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setBusy(true);
    try {
      const taskForce = await api.factory.createTaskForce(project, featureId, {
        name: trimmedName,
        baseBranch: baseBranch.trim() || undefined,
        linearTicket: linearTicket.trim() || undefined,
        start,
      });
      // The create endpoint doesn't take a prompt, so deliver it as the agent's first
      // message once the task force (and its agent, if started) exist.
      const trimmedPrompt = prompt.trim();
      if (start && trimmedPrompt) {
        await api.factory.agentMessage(project, taskForce.id, trimmedPrompt);
      }
      toast.success(`Task force "${taskForce.name}" created`);
      await queryClient.invalidateQueries({ queryKey: ["factory", project] });
      onCreated(taskForce);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task force</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tf-name">Name</Label>
            <Input
              id="tf-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Payments API"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tf-base-branch">Base branch</Label>
            <Input
              id="tf-base-branch"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder="Defaults to the project's base branch"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tf-linear-ticket">Linear ticket</Label>
            <Input
              id="tf-linear-ticket"
              value={linearTicket}
              onChange={(e) => setLinearTicket(e.target.value)}
              placeholder="e.g. ENG-123"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tf-prompt">Initial prompt</Label>
            <Textarea
              id="tf-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Sent as the agent's first message once it starts"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="tf-start" checked={start} onCheckedChange={setStart} />
            <Label htmlFor="tf-start">Start agent now</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || busy}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
