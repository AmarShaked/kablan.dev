/** Extract a Linear ticket id (e.g. "FE-3146") from a branch/worktree name. */
export function extractLinearId(name: string | null | undefined): string | null {
  if (!name) return null;
  const m = name.match(/\b([a-zA-Z]{2,})-(\d+)\b/);
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

function LinearIcon({ className }: { className?: string }) {
  // Linear-style mark — four fanned parallel diagonal bars.
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="3.5" y1="12.5" x2="11.5" y2="4.5" />
      <line x1="3.5" y1="17" x2="17" y2="3.5" />
      <line x1="7" y1="20.5" x2="20.5" y2="7" />
      <line x1="12.5" y1="20.5" x2="20.5" y2="12.5" />
    </svg>
  );
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
      <LinearIcon className="size-3" />
      {id}
    </a>
  );
}
