import type { TokenUsageInfo } from 'shared/types';
import { cn } from '@/lib/utils';

/**
 * The context a task is carrying, because it is what the next turn costs.
 *
 * Every tool call an agent makes re-sends the whole conversation, so the price of a message is
 * the context behind it, not the message. A task that has been worked on for hours carries
 * several times what a fresh one does and costs several times as much to say the same thing —
 * and until now nothing in the app said so. The number arrived from the agent on every turn and
 * was dropped on the floor.
 *
 * The warning threshold is measured, not chosen: Claude Code's own usage breakdown attributes
 * the bulk of consumption to work above 150k context, so that is where this stops being
 * informational and starts being a suggestion to clear.
 */

/** Above this, context is the dominant cost of every further turn. */
export const CONTEXT_WARN_THRESHOLD = 150_000;

function compact(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function contextIsHeavy(info: TokenUsageInfo | null): boolean {
  return !!info && info.total_tokens >= CONTEXT_WARN_THRESHOLD;
}

/**
 * One line: how much context, out of what the model allows.
 *
 * `variant="row"` is the compact form for a list; `variant="detail"` labels itself for a panel.
 */
export function ContextMeter({
  info,
  variant = 'detail',
  className,
}: {
  info: TokenUsageInfo | null;
  variant?: 'row' | 'detail';
  className?: string;
}) {
  // Nothing to say before the agent has reported once, and a zero window means we cannot
  // express it as a fraction — better silent than wrong.
  if (!info || !info.model_context_window) return null;

  const heavy = contextIsHeavy(info);
  const pct = Math.min(
    100,
    Math.round((info.total_tokens / info.model_context_window) * 100)
  );

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 tabular-nums',
        variant === 'row' ? 'text-[11px]' : 'text-xs',
        heavy ? 'text-warning' : 'text-muted-foreground',
        className
      )}
      title={
        heavy
          ? `${info.total_tokens.toLocaleString()} tokens of context — every further turn pays for all of it. Clearing starts a fresh session on the same worktree.`
          : `${info.total_tokens.toLocaleString()} of ${info.model_context_window.toLocaleString()} tokens of context`
      }
    >
      {variant === 'detail' && (
        <span className="text-muted-foreground">Context</span>
      )}
      <span className={cn(heavy && 'font-medium')}>
        {compact(info.total_tokens)}
        <span className="text-muted-foreground">
          {' / '}
          {compact(info.model_context_window)}
        </span>
      </span>
      {/* A bar only in the panel: in a list it would be one more thing competing for the row. */}
      {variant === 'detail' && (
        <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
          <span
            className={cn(
              'block h-full rounded-full',
              heavy ? 'bg-warning' : 'bg-muted-foreground/40'
            )}
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </span>
      )}
    </span>
  );
}
