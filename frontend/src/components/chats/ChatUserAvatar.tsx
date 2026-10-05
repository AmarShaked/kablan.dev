import { cn } from '@/lib/utils';

/** Semantic fills from the legacy palette — soft chip style used elsewhere in the app. */
const AVATAR_TONES = [
  'bg-info/15 text-info',
  'bg-success/15 text-success',
  'bg-warning/15 text-warning',
  'bg-primary/10 text-foreground',
] as const;

function toneForName(name: string): (typeof AVATAR_TONES)[number] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

export function ChatUserAvatar({
  name,
  className,
  size = 'sm',
}: {
  name: string;
  className?: string;
  /** `sm` sidebar rail; `md` message stream; `lg` footer nav-user. */
  size?: 'sm' | 'md' | 'lg';
}) {
  const letter = (name.trim().charAt(0) || '?').toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center font-semibold leading-none',
        size === 'sm' && 'size-4 rounded-full text-[10px]',
        size === 'md' && 'size-9 rounded-md text-sm',
        size === 'lg' && 'size-8 rounded-lg text-sm',
        toneForName(name),
        className
      )}
    >
      {letter}
    </span>
  );
}
