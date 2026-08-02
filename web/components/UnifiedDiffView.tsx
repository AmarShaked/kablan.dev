import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { parsePatch, type ParsedDiff, type Hunk } from "diff";

/** Files whose combined hunk-line count exceeds this collapse by default so a huge diff stays
 * navigable — the user clicks the header to expand them. */
const COLLAPSE_LINE_THRESHOLD = 200;

/** Strips git's `a/`…`b/` diff prefixes and maps `/dev/null` (add/delete sentinel) to null. */
function cleanName(name?: string): string | null {
  if (!name || name === "/dev/null") return null;
  return name.replace(/^[ab]\//, "");
}

function basename(p: string): string {
  return p.split("/").filter(Boolean).pop() ?? p;
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i + 1) : "";
}

type FileKind = "added" | "deleted" | "renamed" | "modified";

interface FileInfo {
  /** Path shown in the header (new path, or old path for a delete). */
  path: string;
  /** For renames, the previous path (else null). */
  oldPath: string | null;
  kind: FileKind;
  added: number;
  removed: number;
  /** Total rendered hunk lines — drives the default-collapsed decision for big files. */
  lineCount: number;
  hunks: Hunk[];
}

function describe(file: ParsedDiff): FileInfo {
  const oldClean = cleanName(file.oldFileName);
  const newClean = cleanName(file.newFileName);
  let added = 0;
  let removed = 0;
  let lineCount = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      lineCount++;
      const c = line[0];
      if (c === "+") added++;
      else if (c === "-") removed++;
    }
  }
  let kind: FileKind;
  if (!oldClean) kind = "added";
  else if (!newClean) kind = "deleted";
  else if (oldClean !== newClean) kind = "renamed";
  else kind = "modified";
  const path = newClean ?? oldClean ?? "unknown";
  return {
    path,
    oldPath: kind === "renamed" ? oldClean : null,
    kind,
    added,
    removed,
    lineCount,
    hunks: file.hunks,
  };
}

const KIND_LABEL: Record<FileKind, string | null> = {
  added: "new",
  deleted: "deleted",
  renamed: "renamed",
  modified: null,
};

function hunkHeader(h: Hunk): string {
  return `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`;
}

/** One collapsible file within the diff: header (path + `+N −M` stat + kind badge) over a
 * horizontally-scrolling body of colored hunk lines. */
function DiffFile({ file, defaultOpen }: { file: FileInfo; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const kindLabel = KIND_LABEL[file.kind];
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        className="flex w-full items-center gap-1.5 bg-muted/40 px-2 py-1.5 text-left transition-colors hover:bg-muted/70"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        ) : (
          <ChevronRight className="size-3 shrink-0 opacity-60" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs">
          {file.oldPath && (
            <span className="text-muted-foreground">{file.oldPath} → </span>
          )}
          <span className="text-muted-foreground">{dirname(file.path)}</span>
          <span className="font-semibold text-foreground">{basename(file.path)}</span>
        </span>
        {kindLabel && (
          <span className="shrink-0 rounded bg-accent px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {kindLabel}
          </span>
        )}
        <span className="shrink-0 font-mono text-xs tabular-nums">
          {file.added > 0 && <span className="text-success">+{file.added}</span>}
          {file.added > 0 && file.removed > 0 && " "}
          {file.removed > 0 && <span className="text-destructive">−{file.removed}</span>}
        </span>
      </button>
      {open && (
        <div className="max-w-full overflow-x-auto bg-muted/20 py-1 font-mono text-[11px] leading-snug custom-scroll">
          <div className="min-w-max">
            {file.hunks.map((hunk, hi) => (
              <div key={hi}>
                <div className="select-none border-y border-border/50 bg-accent/30 px-2 py-0.5 text-muted-foreground/70">
                  {hunkHeader(hunk)}
                </div>
                {hunk.lines.map((line, li) => {
                  const c = line[0];
                  const added = c === "+";
                  const removed = c === "-";
                  const cls = added
                    ? "bg-success/10 text-success"
                    : removed
                      ? "bg-destructive/10 text-destructive"
                      : "text-muted-foreground";
                  const sign = added ? "+" : removed ? "−" : " ";
                  const text = line.slice(1);
                  return (
                    <div key={li} className={`flex whitespace-pre px-2 ${cls}`}>
                      <span className="select-none pr-2 opacity-60">{sign}</span>
                      <span>{text || " "}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Renders a raw unified git-diff string as a stack of per-file, collapsible diff cards — colored
 * +/− lines, hunk headers, monospace with horizontal scroll so long lines never widen the pane.
 * Small diffs expand by default; files with more than ~200 hunk lines start collapsed. */
export function UnifiedDiffView({ diff }: { diff: string }) {
  const files = useMemo(() => {
    let parsed: ParsedDiff[];
    try {
      parsed = parsePatch(diff);
    } catch {
      parsed = [];
    }
    return parsed.filter((f) => f.hunks.length > 0).map(describe);
  }, [diff]);

  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {files.map((file, i) => (
        <DiffFile key={`${file.path}-${i}`} file={file} defaultOpen={file.lineCount <= COLLAPSE_LINE_THRESHOLD} />
      ))}
    </div>
  );
}
