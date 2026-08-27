import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Shown when no projects exist yet.
 *
 * Same treatment as the task board's empty state: a mono wide-tracked eyebrow, a tight-tracked
 * headline, hairline rules rather than a filled panel, and a squared action. The numbered rows
 * describe a real sequence — point at a repo, then hand work to an agent — so the numbering
 * carries meaning instead of decorating the list.
 */
export function ProjectsEmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation('projects');

  const steps = [
    t('empty.steps.point'),
    t('empty.steps.describe'),
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
