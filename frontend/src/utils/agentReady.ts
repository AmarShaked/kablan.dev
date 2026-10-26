import type { BaseCodingAgent } from 'shared/types';

import { configApi } from '@/lib/api';
import { isAgentConnected } from '@/utils/configuredAgents';

/**
 * Whether this machine can run the agent right now.
 *
 * Asked at the moment Start is pressed rather than read off the picker's cache: someone who signs
 * in in a terminal and comes straight back should not be told no. A check that fails answers yes —
 * the server gates the run either way, and a broken check is no reason to refuse a task.
 */
export async function agentCanRun(agent: BaseCodingAgent): Promise<boolean> {
  try {
    return isAgentConnected(await configApi.checkAgentAvailability(agent));
  } catch {
    return true;
  }
}
