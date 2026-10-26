import { useCallback, useEffect, useState } from 'react';
import { BaseCodingAgent } from 'shared/types';
import { configApi } from '../lib/api';

export type AgentAvailabilityState =
  | { status: 'checking' }
  | { status: 'login_detected' }
  | { status: 'installation_found' }
  | { status: 'not_found' }
  // The check itself failed. Distinct from `not_found`: we don't know the answer,
  // rather than knowing the answer is no. Before this existed both rendered nothing.
  | { status: 'error' }
  | null;

export interface AgentAvailabilityResult {
  availability: AgentAvailabilityState;
  /**
   * Re-run the check. The remedy for `not_found` is to sign in from a terminal, so
   * the user has to be able to come back and ask again without restarting Kablan.
   */
  recheck: () => void;
}

/** The two states in which Kablan has seen credentials or an installation. */
export function isAgentReady(availability: AgentAvailabilityState): boolean {
  return (
    availability?.status === 'login_detected' ||
    availability?.status === 'installation_found'
  );
}

export function useAgentAvailability(
  agent: BaseCodingAgent | null | undefined
): AgentAvailabilityResult {
  const [availability, setAvailability] =
    useState<AgentAvailabilityState>(null);
  const [attempt, setAttempt] = useState(0);

  const recheck = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!agent) {
      setAvailability(null);
      return;
    }

    let cancelled = false;

    const checkAvailability = async () => {
      setAvailability({ status: 'checking' });
      try {
        const info = await configApi.checkAgentAvailability(agent);
        if (cancelled) return;

        // Map backend enum to frontend state
        switch (info.type) {
          case 'LOGIN_DETECTED':
            setAvailability({ status: 'login_detected' });
            break;
          case 'INSTALLATION_FOUND':
            setAvailability({ status: 'installation_found' });
            break;
          case 'NOT_FOUND':
            setAvailability({ status: 'not_found' });
            break;
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to check agent availability:', error);
        setAvailability({ status: 'error' });
      }
    };

    checkAvailability();

    return () => {
      cancelled = true;
    };
  }, [agent, attempt]);

  return { availability, recheck };
}
