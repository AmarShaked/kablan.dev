import { LinearLogo } from "../lib/brandLogos.tsx";

/** Extract a Linear ticket id (e.g. "FE-3146") from a branch/worktree name. */
export function extractLinearId(name: string | null | undefined): string | null {
  if (!name) return null;
  const m = name.match(/\b([a-zA-Z]{2,})-(\d+)\b/);
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

export function LinearLink({ id, workspace }: { id: string; workspace: string }) {
  return (
    <a
      href={`https://linear.app/${workspace}/issue/${id}`}
      target="_blank"
      rel="noreferrer"
      title={`Open ${id} in Linear`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-mono text-muted-foreground transition-colors hover:text-foreground hover:border-muted-foreground/50"
    >
      <LinearLogo className="size-3 shrink-0" />
      {id}
    </a>
  );
}
