import {
  parseMentionSegments,
  type MentionSegment,
} from '@/lib/chatMentions';
import { agentChatTone } from '@/lib/agentChatColors';
import { cn } from '@/lib/utils';
import type { BaseCodingAgent } from 'shared/types';

export function MentionHighlight({
  text,
  agents,
  extraNames = [],
  className,
  /** Composer overlay must not add padding — it would desync from the caret. */
  variant = 'message',
}: {
  text: string;
  agents: BaseCodingAgent[];
  extraNames?: string[];
  className?: string;
  variant?: 'message' | 'composer';
}) {
  const segments = parseMentionSegments(text, agents, extraNames);
  return (
    <span className={className}>
      {segments.map((seg, i) => (
        <MentionPart key={i} segment={seg} variant={variant} />
      ))}
    </span>
  );
}

function MentionPart({
  segment,
  variant,
}: {
  segment: MentionSegment;
  variant: 'message' | 'composer';
}) {
  if (segment.type === 'mention') {
    const tone = agentChatTone(segment.agent);
    return (
      <span
        className={cn(
          'inline rounded-sm',
          tone.mention,
          variant === 'message' && 'mx-0.5 px-1 py-0.5 font-medium',
          // Keep weight/metrics identical to the textarea so the caret lines up.
          variant === 'composer' && 'font-normal'
        )}
      >
        {segment.value}
      </span>
    );
  }
  return <>{segment.value}</>;
}
