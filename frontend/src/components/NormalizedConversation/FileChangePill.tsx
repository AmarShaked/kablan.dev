import { cn } from '@/lib/utils';

export function fileBasename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '');
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function glyphLabel(ext: string): string {
  if (ext === 'tsx' || ext === 'jsx') return 'R';
  if (ext === 'ts') return 'TS';
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return 'JS';
  if (ext === 'json') return '{}';
  if (!ext) return 'F';
  return ext.slice(0, 2).toUpperCase();
}

function glyphClass(ext: string): string {
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
    return 'text-sky-500';
  }
  if (ext === 'json') return 'text-amber-500';
  if (ext === 'css' || ext === 'scss') return 'text-violet-500';
  if (ext === 'md' || ext === 'mdx') return 'text-muted-foreground';
  if (ext === 'rs') return 'text-orange-500';
  if (ext === 'py') return 'text-yellow-600';
  return 'text-muted-foreground';
}

function FileKindGlyph({ path }: { path: string }) {
  const ext = (path.split('.').pop() ?? '').toLowerCase();
  return (
    <span
      className={cn(
        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] bg-muted text-[7px] font-bold leading-none',
        glyphClass(ext)
      )}
      aria-hidden
    >
      {glyphLabel(ext)}
    </span>
  );
}

type FileChangePillProps = {
  path: string;
  added?: number;
  removed?: number;
  action?: 'edit' | 'write' | 'delete' | 'rename';
  newPath?: string;
  selected?: boolean;
  onClick?: () => void;
};

export function FileChangePill({
  path,
  added = 0,
  removed = 0,
  action = 'edit',
  newPath,
  selected,
  onClick,
}: FileChangePillProps) {
  const name = fileBasename(path);
  const renamed = action === 'rename' && newPath ? fileBasename(newPath) : null;
  const deleted = action === 'delete';

  const clickable = Boolean(onClick);
  const Wrapper = clickable ? 'button' : 'span';

  return (
    <Wrapper
      {...(clickable
        ? {
            type: 'button' as const,
            onClick,
            'aria-expanded': selected,
          }
        : {})}
      className={cn(
        'inline-flex h-[26px] max-w-full items-center gap-2 rounded-md border bg-background pl-1.5 pr-2 text-left',
        selected ? 'border-border' : 'border-border/80',
        clickable && 'cursor-pointer hover:border-muted-foreground/50'
      )}
    >
      <FileKindGlyph path={renamed ? newPath! : path} />
      <span
        className={cn(
          'truncate text-xs text-foreground',
          deleted && 'text-muted-foreground line-through'
        )}
      >
        {renamed ? `${name} → ${renamed}` : name}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums">
        {added > 0 && (
          <span className="text-[hsl(var(--console-success))]">+{added}</span>
        )}
        {removed > 0 && (
          <span className="text-[hsl(var(--console-error))]">−{removed}</span>
        )}
        {action === 'write' && added === 0 && removed === 0 && (
          <span className="text-[10px] text-muted-foreground">new</span>
        )}
      </span>
    </Wrapper>
  );
}
