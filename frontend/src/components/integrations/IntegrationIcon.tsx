import { IntegrationProvider, ThemeMode } from 'shared/types';
import { useTheme } from '@/components/ThemeProvider';
import { integrationLabel } from '@/lib/integrations/catalog';
import { cn } from '@/lib/utils';

function getResolvedTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === ThemeMode.SYSTEM) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme === ThemeMode.DARK ? 'dark' : 'light';
}

function iconPath(
  provider: IntegrationProvider,
  theme: 'light' | 'dark'
): string {
  switch (provider) {
    case IntegrationProvider.LINEAR:
      return '/integrations/linear.svg';
    case IntegrationProvider.JIRA:
      return '/integrations/jira.svg';
    case IntegrationProvider.GITHUB_ISSUES:
      return theme === 'dark'
        ? '/integrations/github-dark.svg'
        : '/integrations/github-light.svg';
    case IntegrationProvider.MONDAY:
      return '/integrations/monday.svg';
  }
}

export function IntegrationIcon({
  provider,
  className,
}: {
  provider: IntegrationProvider;
  className?: string;
}) {
  const { theme } = useTheme();
  const resolvedTheme = getResolvedTheme(theme);

  return (
    <img
      src={iconPath(provider, resolvedTheme)}
      alt={integrationLabel(provider)}
      className={cn('shrink-0 object-contain', className ?? 'size-4')}
    />
  );
}
