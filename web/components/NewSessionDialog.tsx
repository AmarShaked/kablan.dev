import { useEffect, useRef, useState } from "react";
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
import { ChevronsUpDown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** A pasted/dropped image staged in the composer, awaiting session start. `data` is the raw base64
 * (no data-URL prefix) for the API; `url` is the full data URL for the thumbnail preview. Mirrors
 * AgentChat's `Attachment`. */
type Attachment = { id: string; url: string; mediaType: string; data: string };

export interface NewSessionDialogProps {
  project: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Base-branch options — the caller's `useBranches(project)` data. */
  branches: Branch[];
  /** Called with the freshly-generated `session/<hex>` branch name once the session has started.
   * `images` are the staged data URLs, handed to the cockpit so its opening "You" bubble shows
   * their thumbnails. */
  onStarted: (branch: string, message?: string, images?: string[]) => void;
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
  // Images pasted/dropped into the first-message box, staged until Start (removable thumbnails).
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachSeq = useRef(0);
  // Drag-and-drop overlay state. `dragDepth` counts enter/leave over nested children so the
  // "Drop images to attach" overlay doesn't flicker as the pointer crosses child elements.
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);

  // Read an image File into a staged Attachment: base64 data URL for the thumbnail, raw base64
  // (prefix stripped) for the API. Shared by the paste and drop handlers. Mirrors AgentChat.
  const stageImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result); // data:<mediaType>;base64,<data>
      const comma = url.indexOf(",");
      const data = comma >= 0 ? url.slice(comma + 1) : "";
      if (!data) return;
      const id = `att-${(attachSeq.current += 1)}`;
      setAttachments((prev) => [...prev, { id, url, mediaType: file.type, data }]);
    };
    reader.readAsDataURL(file);
  };

  // Paste-to-attach: pull image files off the clipboard and stage them. preventDefault stops the
  // browser also pasting the image's name as text into the box.
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItems = Array.from(e.clipboardData?.items ?? []).filter(
      (it) => it.kind === "file" && it.type.startsWith("image/"),
    );
    if (imageItems.length === 0) return;
    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) stageImageFile(file);
    }
  };
  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  // Drag-and-drop-to-attach over the dialog body. A drag carrying files toggles the overlay (via
  // the enter/leave depth counter); dragover preventDefault marks it a valid drop target. On drop
  // we preventDefault (so the browser doesn't navigate to the file) and stage the image files.
  const dragHasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const onDragEnter = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault(); // required so the drop event fires
    if (!dragActive) setDragActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer?.files ?? []);
    dragDepth.current = 0;
    setDragActive(false);
    if (files.length === 0) return;
    e.preventDefault();
    const images = files.filter((f) => f.type.startsWith("image/"));
    for (const file of images) stageImageFile(file);
    if (images.length === 0) toast("Only image files can be attached.");
  };

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
    setAttachments([]);
    dragDepth.current = 0;
    setDragActive(false);
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
      // Raw base64 pairs for the API; data URLs for the seeded cockpit bubble. Both are threaded
      // only when there are attachments, so an image-free start keeps the original call shape.
      const images = attachments.map((a) => ({ mediaType: a.mediaType, data: a.data }));
      const imageUrls = attachments.map((a) => a.url);
      const { branch } = await api.factory.startSession(project, baseBranch, {
        message: firstMessage,
        copyNodeModules,
        copyEnv,
        ...(images.length ? { images } : {}),
      });
      if (imageUrls.length) onStarted(branch, firstMessage, imageUrls);
      else onStarted(branch, firstMessage);
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
      <DialogContent
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragActive && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80 text-sm font-medium text-primary backdrop-blur-sm">
            Drop images to attach
          </div>
        )}
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
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && baseBranch && !busy) handleStart();
            }}
            placeholder="What should the agent do first? (paste or drop an image to attach)"
            rows={4}
          />
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a) => (
                <div key={a.id} className="group relative">
                  <img
                    src={a.url}
                    alt="pasted attachment"
                    className="size-16 rounded-md border border-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    aria-label="Remove image"
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
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
