import { useTranslation } from 'react-i18next';

import { warzoneToolbarStatusParts } from '@/lib/warzone/toolbarStatus';
import { cn } from '@/lib/utils';

type WarzoneToolbarProps = {
  projects: { id: string; name: string }[];
  projectFilter: string | null;
  needsYouCount: number;
  overflow: number;
  mockMode?: boolean;
  onSelectProject: (projectId: string | null) => void;
};

export function WarzoneToolbar({
  projects,
  projectFilter,
  needsYouCount,
  overflow,
  mockMode = false,
  onSelectProject,
}: WarzoneToolbarProps) {
  const { t } = useTranslation('warzone');
  const statusParts = warzoneToolbarStatusParts({
    needsYouCount,
    overflow,
  }).map((part) => t(part.key, { count: part.count }));

  const activeValue = projectFilter ?? 'all';

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="flex shrink-0 items-center gap-1.5">
        <h1 className="text-sm font-semibold">{t('title')}</h1>
        {mockMode && (
          <span className="rounded border border-dashed border-warning/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-warning">
            mock
          </span>
        )}
      </div>

      <div
        role="tablist"
        aria-label={t('allProjects')}
        className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto border-b border-border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Tab
          selected={activeValue === 'all'}
          onClick={() => onSelectProject(null)}
        >
          {t('allProjects')}
        </Tab>
        {projects.map((project) => (
          <Tab
            key={project.id}
            selected={activeValue === project.id}
            onClick={() => onSelectProject(project.id)}
          >
            {project.name}
          </Tab>
        ))}
      </div>

      {statusParts.length > 0 && (
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
          {statusParts.join(' · ')}
        </span>
      )}
    </div>
  );
}

function Tab({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={cn(
        'shrink-0 border-b-2 px-3 py-1.5 text-sm transition-colors -mb-px',
        selected
          ? 'border-foreground font-medium text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
