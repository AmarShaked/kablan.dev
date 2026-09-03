import { useTranslation } from 'react-i18next';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { UsageSection } from '@/components/settings/UsageSection';

/**
 * What is left of the Claude subscription's rate-limit windows.
 *
 * Its own page rather than a card under General because it is the one settings
 * page that reports rather than configures — nothing here is saved — and
 * because reading it costs a Claude Code CLI run, which should happen when
 * somebody has come to look at it and not when they open an unrelated page.
 */
export function UsageSettings() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.usage.title')}</CardTitle>
          <CardDescription>{t('settings.usage.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <UsageSection />
        </CardContent>
      </Card>
    </div>
  );
}
