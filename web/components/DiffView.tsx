import { Fragment, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { diffLines, type Change } from "diff";
import { useExpanded } from "../lib/chatExpand.ts";

/** One contiguous run of diff parts (an Edit's single before→after, or one hunk of a MultiEdit). */
type DiffHunk = Change[];

/** Splits a diff part's `value` into display lines, dropping the single trailing newline jsdiff
 * keeps on each part so we don't render a phantom empty line at every part boundary. */
function splitLines(value: string): string[] {
  if (value === "") return [];
  const noTrail = value.endsWith("\n") ? value.slice(0, -1) : value;
  return noTrail.split("\n");
}

function countLines(value: string): number {
  return splitLines(value).length;
}

/** Turns a file-editing tool's input into a set of diff hunks + `+N/−M` line stats. `Edit` diffs
 * `old_string`→`new_string`; `MultiEdit` yields one hunk per edit; `Write` is rendered as one
 * all-additions hunk of its `content`. */
export function buildDiff(
  name: string,
  input: unknown,
): { hunks: DiffHunk[]; additions: number; deletions: number; filePath?: string } {
  const inp = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const filePath = inp.file_path ? String(inp.file_path) : undefined;
  const hunks: DiffHunk[] = [];
  if (name === "Write") {
    const content = String(inp.content ?? "");
    hunks.push([{ added: true, removed: false, value: content, count: countLines(content) }]);
  } else if (name === "MultiEdit") {
    const edits = Array.isArray(inp.edits) ? inp.edits : [];
    for (const e of edits) {
      hunks.push(diffLines(String(e?.old_string ?? ""), String(e?.new_string ?? "")));
    }
  } else {
    hunks.push(diffLines(String(inp.old_string ?? ""), String(inp.new_string ?? "")));
  }
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const part of hunk) {
      const n = countLines(part.value);
      if (part.added) additions += n;
      else if (part.removed) deletions += n;
    }
  }
  return { hunks, additions, deletions, filePath };
}

function base(p: string): string {
  return p.split("/").filter(Boolean).pop() ?? p;
}

/** A small status dot mirroring ToolLine's: green = succeeded, red = errored, hollow = pending. */
function DiffStatusDot({ hasResult, isError }: { hasResult: boolean; isError?: boolean }) {
  const cls = !hasResult
    ? "border border-muted-foreground/60 bg-transparent"
    : isError
      ? "bg-destructive"
      : "bg-success";
  const title = !hasResult ? "pending" : isError ? "error" : "success";
  return <span aria-hidden title={title} className={`size-1.5 shrink-0 rounded-full ${cls}`} />;
}

/** The rich, non-groupable entry that replaces the plain "⏺ Edit file.ts" line for `Edit`/
 * `MultiEdit`/`Write` tools. Collapsed it shows just the file basename, a `+N −M` stat and a status
 * dot; expanding reveals a unified-diff view (added lines green, removed red, context muted) that
 * scrolls horizontally so long lines never widen the pane. */
export function DiffView({
  id,
  name,
  input,
  hasResult,
  isError,
}: {
  /** Stable per-entry id for persisting the open state across reloads/remounts. */
  id: string;
  name: string;
  input: unknown;
  hasResult: boolean;
  isError?: boolean;
}) {
  const [open, setOpen] = useExpanded(id);
  const { hunks, additions, deletions, filePath } = useMemo(() => buildDiff(name, input), [name, input]);
  const label = filePath ? base(filePath) : name;

  return (
    <div className="flex max-w-full flex-col self-start">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={filePath ?? name}
        className="flex max-w-full items-center gap-1.5 self-start rounded px-0.5 py-0.5 text-left font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        ) : (
          <ChevronRight className="size-3 shrink-0 opacity-60" />
        )}
        <DiffStatusDot hasResult={hasResult} isError={isError} />
        <span className="shrink-0 text-primary">⏺</span>
        <span className="truncate text-foreground">{label}</span>
        <span className="shrink-0 tabular-nums">
          {additions > 0 && <span className="text-success">+{additions}</span>}
          {additions > 0 && deletions > 0 && " "}
          {deletions > 0 && <span className="text-destructive">−{deletions}</span>}
        </span>
      </button>
      {open && (
        <div className="mt-1 ml-[15px] max-w-full overflow-x-auto rounded bg-muted/40 py-1 font-mono text-[11px] leading-snug custom-scroll">
          <div className="min-w-max">
            {hunks.map((hunk, hi) => (
              <Fragment key={hi}>
                {hi > 0 && (
                  <div className="select-none px-2 py-0.5 text-muted-foreground/40">⋯</div>
                )}
                {hunk.flatMap((part, pi) =>
                  splitLines(part.value).map((line, li) => {
                    const cls = part.added
                      ? "bg-success/10 text-success"
                      : part.removed
                        ? "bg-destructive/10 text-destructive"
                        : "text-muted-foreground";
                    const sign = part.added ? "+" : part.removed ? "−" : " ";
                    return (
                      <div key={`${pi}-${li}`} className={`flex whitespace-pre px-2 ${cls}`}>
                        <span className="select-none pr-2 opacity-60">{sign}</span>
                        <span>{line || " "}</span>
                      </div>
                    );
                  }),
                )}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
