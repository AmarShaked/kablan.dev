import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Shown on a task that has never been attempted.
 *
 * The same treatment as the projects and tasks empty states — mono wide-tracked eyebrow,
 * tight-tracked headline, hairline rules rather than a filled panel, squared action — because
 * this is the third place in the app where you arrive with nothing yet and need to be told what
 * the next move is. A one-line "No attempts yet" in an otherwise empty pane told you the state
 * and nothing about what to do with it.
 *
 * The numbered rows describe a real sequence, not decoration: a worktree is made, an agent works
 * in it, and you review the result.
 */
export function AttemptsEmptyState({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation('tasks');

  const steps = [
    t('taskPanel.empty.steps.worktree'),
    t('taskPanel.empty.steps.agent'),
    t('taskPanel.empty.steps.review'),
  ];

  return (
    <div className="mx-auto mt-12 max-w-2xl px-6 text-center">
      <p className="font-ibm-plex-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {t('taskPanel.empty.eyebrow')}
      </p>
      <h2 className="mt-4 text-3xl font-medium tracking-tight">
        {t('taskPanel.empty.headline')}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        {t('taskPanel.empty.body')}
      </p>

      <Button className="mt-8" onClick={onStart}>
        <Plus className="mr-2 h-4 w-4" />
        {t('taskPanel.empty.start')}
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
