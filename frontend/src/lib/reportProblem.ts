import type { Environment } from 'shared/types';
import { CURRENT_VERSION } from '@/hooks/useLatestRelease';
import { agentLabel } from '@/utils/agentLabels';

/**
 * A link that opens a GitHub issue form with the boring half already typed.
 *
 * Kablan does not instrument anything, so the only way we find out something broke is if the
 * person it broke for tells us — and the cost of telling us is the form. Most of what that form
 * asks for is sitting in the app already: which version this is, what OS it is on, which agent
 * was selected. Filling it in by hand is the step where people give up.
 *
 * This builds a URL. Nothing is sent. The browser opens github.com with query parameters, the
 * person reads the pre-filled body, edits or deletes any of it, and presses Submit themselves.
 * That is the user sending a message to a public issue tracker, not the app phoning home, and it
 * is the only shape of this that is allowed to exist.
 */

const REPO_URL = 'https://github.com/AmarShaked/kablan.dev';

/** GitHub caps issue-form prefill at 8KB of URL; we are nowhere near it, but keep it bounded. */
const MAX_FIELD_LENGTH = 500;

export type ReportTemplate = 'didnt-work.yml' | 'bug-report.yml';

type ReportContext = {
  environment: Environment | null;
  /** The executor the user last picked, if they have picked one. */
  executor?: string | null;
};

/**
 * What the app knows about this machine, as the lines a person would otherwise type.
 *
 * Browser and OS come from two different places on purpose: `Environment` is the host the server
 * binary is running on, `navigator.userAgent` is whatever is rendering this. On a remote or
 * container setup those are not the same machine, and knowing which half is which has already
 * explained more than one report.
 */
export function environmentReport(environment: Environment | null): string {
  const lines = [`Kablan: ${CURRENT_VERSION}`];

  if (environment) {
    const os = [environment.os_type, environment.os_version]
      .filter((part) => part && part !== 'Unknown')
      .join(' ');
    lines.push(`OS: ${os || 'unknown'} (${environment.os_architecture})`);
  } else {
    lines.push('OS:');
  }

  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    lines.push(`Browser: ${navigator.userAgent}`);
  }

  return lines.join('\n');
}

function truncate(value: string): string {
  return value.length > MAX_FIELD_LENGTH
    ? `${value.slice(0, MAX_FIELD_LENGTH)}…`
    : value;
}

/**
 * The URL for "report a problem".
 *
 * Parameter names are the `id`s of the fields in the issue form — GitHub matches them up and
 * pre-fills. An id that no longer exists in the template is ignored rather than erroring, so a
 * template edit degrades to an empty box instead of a broken link.
 */
export function buildReportProblemUrl(
  context: ReportContext,
  template: ReportTemplate = 'didnt-work.yml'
): string {
  const params = new URLSearchParams({ template });

  params.set('environment', truncate(environmentReport(context.environment)));

  if (context.executor) {
    params.set('agent', truncate(agentLabel(context.executor)));
  }

  return `${REPO_URL}/issues/new?${params.toString()}`;
}

/** Where "ask a question" goes — lower stakes than an issue, and often the right first stop. */
export const DISCUSSIONS_URL = `${REPO_URL}/discussions`;
