import {
  parseMentionSegments,
  type MentionSegment,
  type NamedProject,
} from '@/lib/chatMentions';
import { agentChatTone } from '@/lib/agentChatColors';
import { cn } from '@/lib/utils';
import type { BaseCodingAgent } from 'shared/types';

export function MentionHighlight({
  text,
  agents,
  extraNames = [],
  projects = [],
  className,
  /** Composer overlay must not add padding — it would desync from the caret. */
  variant = 'message',
}: {
  text: string;
  agents: BaseCodingAgent[];
  extraNames?: string[];
  projects?: NamedProject[];
  className?: string;
  variant?: 'message' | 'composer';
}) {
  const segments = parseMentionSegments(text, agents, extraNames, projects);
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
  if (segment.type === 'project') {
    return (
      <span
        className={cn(
          'inline rounded-sm text-info',
          variant === 'message' &&
            'mx-0.5 bg-info/15 px-1 py-0.5 font-medium',
          variant === 'composer' && 'font-normal'
        )}
      >
        {segment.value}
      </span>
    );
  }
  return <>{segment.value}</>;
}
