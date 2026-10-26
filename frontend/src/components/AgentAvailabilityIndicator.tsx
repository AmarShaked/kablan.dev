import type { ReactNode } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import type { BaseCodingAgent } from 'shared/types';
import type { AgentAvailabilityState } from '@/hooks/useAgentAvailability';
import {
  agentInstallUrl,
  agentLabel,
  agentSignInCommand,
} from '@/utils/agentLabels';
import { Button } from '@/components/ui/button';

interface AgentAvailabilityIndicatorProps {
  availability: AgentAvailabilityState;
  /** Which agent is being reported on. Names the agent and its sign-in command in the copy. */
  agent?: BaseCodingAgent | string | null;
  /**
   * Re-run the check. The remedy for every amber state is something the user does in a terminal,
   * so without a way back there is no way to find out it worked short of restarting Kablan.
   */
  onRecheck?: () => void;
  className?: string;
}

/**
 * Whether Kablan can see a usable coding agent on this machine.
 *
 * The honesty constraint on every string here: readiness is a check for saved credentials, not a
 * check that the agent runs. So nothing below says "signed in" — `login_detected` means a
 * credentials file was found, which is a weaker claim, and the detail line says so.
 *
 * Amber is the existing `--warning`, matching `EditorAvailabilityIndicator`. The two amber states
 * are different claims and are kept apart deliberately: `not_found` is "we looked and the answer
 * is no", `error` is "we couldn't look". Both used to render nothing at all.
 */
export function AgentAvailabilityIndicator({
  availability,
  agent,
  onRecheck,
  className = '',
}: AgentAvailabilityIndicatorProps) {
  const { t } = useTranslation('settings');

  if (!availability) return null;

  const name = agentLabel(agent);
  const command = agentSignInCommand(agent);
  const installUrl = agentInstallUrl(agent);

  // Every detail string has a variant for the case where we don't know the agent's sign-in
  // command. Naming the wrong command would be worse than naming none — the user types it.
  const detail = (key: string) => (
    <Trans
      t={t}
      i18nKey={`settings.agents.availability.${key}${command ? '' : '_noCommand'}`}
      values={{ agent: name, command }}
      components={{
        cmd: <code className="font-ibm-plex-mono text-foreground" />,
      }}
    />
  );

  const ready = (labelKey: string, detailKey: string) => (
    <>
      <div className="flex items-center gap-2">
        <Check className="h-4 w-4 text-success" />
        <span className="text-success">
          {t(`settings.agents.availability.${labelKey}`, { agent: name })}
        </span>
      </div>
      <p className="text-xs text-muted-foreground pl-6">{detail(detailKey)}</p>
    </>
  );

  const notReady = (
    labelKey: string,
    detailKey: string,
    actions?: ReactNode
  ) => (
    <>
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-warning" />
        <span className="text-warning">
          {t(`settings.agents.availability.${labelKey}`, { agent: name })}
        </span>
      </div>
      <p className="text-xs text-muted-foreground pl-6">{detail(detailKey)}</p>
      {(onRecheck || actions) && (
        <div className="flex items-center gap-3 pl-6 pt-0.5">
          {onRecheck && (
            <Button size="sm" variant="outline" onClick={onRecheck}>
              {t('settings.agents.availability.recheck')}
            </Button>
          )}
          {actions}
        </div>
      )}
    </>
  );

  return (
    <div className={`flex flex-col gap-1 text-sm ${className}`.trim()}>
      {availability.status === 'checking' && (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">
            {t('settings.agents.availability.checking', { agent: name })}
          </span>
        </div>
      )}
      {availability.status === 'login_detected' &&
        ready('loginDetected', 'loginDetectedTooltip')}
      {availability.status === 'installation_found' &&
        ready('installationFound', 'installationFoundTooltip')}
      {availability.status === 'not_found' &&
        notReady(
          'notFound',
          'notFoundTooltip',
          installUrl && (
            <a
              href={installUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              {t('settings.agents.availability.install', { agent: name })} ↗
            </a>
          )
        )}
      {availability.status === 'error' &&
        notReady('checkFailed', 'checkFailedTooltip')}
    </div>
  );
}
