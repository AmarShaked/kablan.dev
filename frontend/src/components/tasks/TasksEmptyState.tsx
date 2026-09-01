import { useTranslation } from 'react-i18next';
import { Plus, SearchX } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Empty states for the task board.
 *
 * Built in the same language as the rest of the app (nitur.dev): a mono, wide-tracked eyebrow,
 * a tight-tracked headline, hairline rules instead of filled panels, and squared controls.
 *
 * The numbered rows are not decoration — a task really does move through those three steps in
 * order, so the numbering carries information for someone who hasn't used the app yet.
 */
export function NoTasksEmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation('tasks');

  const steps = [
    t('empty.steps.describe'),
    t('empty.steps.isolate'),
    t('empty.steps.review'),
  ];

  return (
    <div className="mx-auto mt-16 max-w-2xl px-6 text-center">
      <p className="font-ibm-plex-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {t('empty.eyebrow')}
      </p>
      <h2 className="mt-4 text-3xl font-medium tracking-tight">
        {t('empty.headline')}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        {t('empty.body')}
      </p>

      <Button className="mt-8" onClick={onCreate}>
        <Plus className="mr-2 h-4 w-4" />
        {t('empty.createFirst')}
      </Button>

      <ol className="mt-12 border-t border-border text-left">
        {steps.map((step, i) => (
          <li
            key={step}
            className="flex items-baseline gap-4 border-b border-border py-3"
          >
            <span className="font-ibm-plex-mono text-[11px] tabular-nums text-muted-foreground">
              {String(i + 1).padStart(3, '0')}
            </span>
            <span className="text-sm">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Shown when a search or filter hides every task — a different situation to having none. */
export function NoSearchResultsEmptyState({
  onClear,
}: {
  onClear?: () => void;
}) {
  const { t } = useTranslation('tasks');

  return (
    <div className="mx-auto mt-16 max-w-md px-6 text-center">
      <SearchX className="mx-auto h-6 w-6 text-muted-foreground" />
      <h2 className="mt-4 text-lg font-medium tracking-tight">
        {t('empty.noSearchResults')}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('empty.noSearchResultsHint')}
      </p>
      {onClear && (
        <Button variant="outline" className="mt-6" onClick={onClear}>
          {t('empty.clearFilters')}
        </Button>
      )}
    </div>
  );
}
