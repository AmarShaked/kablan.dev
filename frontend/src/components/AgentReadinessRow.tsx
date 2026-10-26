import { BaseCodingAgent } from 'shared/types';
import { AgentAvailabilityIndicator } from '@/components/AgentAvailabilityIndicator';
import {
  isAgentReady,
  useAgentAvailability,
} from '@/hooks/useAgentAvailability';
import { useUserSystem } from '@/contexts/UserSystemContext';

interface AgentReadinessRowProps {
  /** Defaults to the agent the user last ran, which is the one they'd get if they started now. */
  agent?: BaseCodingAgent | string | null;
  /**
   * Render nothing while the agent is ready or still being checked. For screens where the row is
   * an interruption rather than a field — the empty boards — and silence is the correct output.
   */
  onlyWhenNotReady?: boolean;
  className?: string;
}

/**
 * The readiness row, wired to the check.
 *
 * `AgentAvailabilityIndicator` stays presentational so it can be driven by a dialog that already
 * owns the state; this is the container for the three places that just want the row. Keeping both
 * means the onboarding dialog, the empty boards and the new-task dialog render the same component
 * rather than three descriptions of the same fact that can drift apart.
 */
export function AgentReadinessRow({
  agent,
  onlyWhenNotReady = false,
  className,
}: AgentReadinessRowProps) {
  const { config } = useUserSystem();
  const resolved =
    agent ??
    config?.last_agent_selection?.executor ??
    BaseCodingAgent.CLAUDE_CODE;

  const { availability, recheck } = useAgentAvailability(
    resolved as BaseCodingAgent
  );

  // On a screen that only speaks up for problems, `checking` is not a problem — rendering it
  // would flash a spinner above the headline and then vanish.
  if (
    onlyWhenNotReady &&
    (!availability ||
      availability.status === 'checking' ||
      isAgentReady(availability))
  ) {
    return null;
  }

  return (
    <AgentAvailabilityIndicator
      availability={availability}
      agent={resolved}
      onRecheck={recheck}
      className={className}
    />
  );
}
