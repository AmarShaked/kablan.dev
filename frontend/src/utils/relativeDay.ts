import { TimeFormat } from 'shared/types';

export function usesHour12(format?: TimeFormat): boolean {
  return format !== TimeFormat.HOUR24;
}

/**
 * When something was last touched, in the shorthand a mail list uses: a time today, a weekday
 * this week, a date beyond that.
 *
 * The exact timestamp lives on the thing itself; in a list this only has to place a row in the
 * last day, the last week, or further back, in as few characters as that takes.
 */
export function relativeDay(
  iso: string | Date,
  hour12 = true,
  locale?: string
): string {
  const then = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const now = new Date();
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);

  if (days < 1 && now.getDate() === then.getDate()) {
    return then.toLocaleTimeString(locale, {
      hour: hour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
      hour12,
    });
  }
  if (days < 7) {
    return then.toLocaleDateString(locale, { weekday: 'short' });
  }
  return then.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
