import type { ReactElement, ReactNode } from 'react';
import { Plus, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { useProject } from '@/contexts/ProjectContext';
import { useProjectRepos } from '@/hooks';
import { useOpenProjectInEditor } from '@/hooks/useOpenProjectInEditor';
import { openTaskForm } from '@/lib/openTaskForm';
import { IdeIcon, getIdeName } from '@/components/ide/IdeIcon';
import { useUserSystem } from '@/contexts/UserSystemContext';
import {
  buildProjectSettingsPath,
  isProjectSettingsPath,
} from '@/lib/routes/projectRoutes';
import { paths } from '@/lib/paths';
import {
  parseWarzoneLayout,
  WARZONE_LAYOUT_IDS,
  type WarzoneLayoutId,
} from '@/lib/warzone/slots';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * The actions you take *on* the project, as a column down the right edge.
 *
 * Creating a task sat in the task list's own toolbar, opening the IDE sat at the far
 * end of the header, and project settings lived in the app Settings tab — none of
 * those belonged to their neighbours. A rail gives them somewhere to be: always in
 * the same place whatever the middle of the screen is doing. It is a column of icons,
 * so each one says what it is on hover rather than in a label.
 */

/** One rail button. Plain, not the shared Button: its size variants add padding a rail does not want. */
function RailButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-lg',
            'border border-border bg-background text-muted-foreground',
            'transition-colors hover:bg-accent hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            active && 'bg-accent text-foreground'
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

function LayoutIcon16({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      className={className}
      aria-hidden
    >
      <rect x="1.5" y="1.5" width="3" height="3" rx="0.5" />
      <rect x="6.5" y="1.5" width="3" height="3" rx="0.5" />
      <rect x="11.5" y="1.5" width="3" height="3" rx="0.5" />
      <rect x="1.5" y="6.5" width="3" height="3" rx="0.5" />
      <rect x="11.5" y="6.5" width="3" height="3" rx="0.5" />
      <rect x="1.5" y="11.5" width="3" height="3" rx="0.5" />
      <rect x="6.5" y="11.5" width="3" height="3" rx="0.5" />
      <rect x="11.5" y="11.5" width="3" height="3" rx="0.5" />
      <rect x="5.25" y="5.25" width="5.5" height="5.5" rx="0.5" />
    </svg>
  );
}

function LayoutIcon10({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      className={className}
      aria-hidden
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={`t${i}`}
          x={1.5 + i * 2.8}
          y="1.5"
          width="2.2"
          height="2.2"
          rx="0.4"
        />
      ))}
      <rect x="1.5" y="5.5" width="13" height="5" rx="0.5" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={`b${i}`}
          x={1.5 + i * 2.8}
          y="12.3"
          width="2.2"
          height="2.2"
          rx="0.4"
        />
      ))}
    </svg>
  );
}

function LayoutIcon5({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      className={className}
      aria-hidden
    >
      <rect x="1.5" y="1.5" width="8.5" height="13" rx="0.5" />
      <rect x="11.2" y="1.5" width="3.3" height="2" rx="0.4" />
      <rect x="11.2" y="4.25" width="3.3" height="2" rx="0.4" />
      <rect x="11.2" y="7" width="3.3" height="2" rx="0.4" />
      <rect x="11.2" y="9.75" width="3.3" height="2" rx="0.4" />
      <rect x="11.2" y="12.5" width="3.3" height="2" rx="0.4" />
    </svg>
  );
}

const LAYOUT_ICONS: Record<
  WarzoneLayoutId,
  (props: { className?: string }) => ReactElement
> = {
  16: LayoutIcon16,
  10: LayoutIcon10,
  5: LayoutIcon5,
};

function WarzoneLayoutRail() {
  const { t } = useTranslation('warzone');
  const [params, setParams] = useSearchParams();
  const layoutId = parseWarzoneLayout(params.get('layout'));

  const setLayout = (id: WarzoneLayoutId) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id === 16) next.delete('layout');
        else next.set('layout', String(id));
        return next;
      },
      { replace: true }
    );
  };

  return (
    <>
      {WARZONE_LAYOUT_IDS.map((id) => {
        const Icon = LAYOUT_ICONS[id];
        return (
          <RailButton
            key={id}
            label={t(`layout.${id}`)}
            active={layoutId === id}
            onClick={() => setLayout(id)}
          >
            <Icon className="h-4 w-4" />
          </RailButton>
        );
      })}
    </>
  );
}

export function RightRail() {
  const { projectId, project } = useProject();
  const { data: repos } = useProjectRepos(projectId);
  const openInEditor = useOpenProjectInEditor(project || null);
  const { config } = useUserSystem();
  const navigate = useNavigate();
  const location = useLocation();
  const isWarzone = location.pathname === paths.warzone();

  // Warzone has no project context — show layout switchers instead of project actions.
  if (isWarzone) {
    return (
      <TooltipProvider>
        <aside
          aria-label="Warzone layouts"
          className="flex h-full w-14 shrink-0 flex-col items-center gap-2 bg-muted/30 py-3"
        >
          <WarzoneLayoutRail />
        </aside>
      </TooltipProvider>
    );
  }

  // Nothing here is about the app, only about a project — so with no project open there is
  // nothing to show, and an empty rail would just be a stripe.
  if (!projectId) return null;

  // The same condition the header used: with several repositories there is no single thing to
  // open, and the choice belongs in the attempt rather than here.
  const canOpenInIde = repos?.length === 1;

  return (
    <TooltipProvider>
      <aside
        aria-label="Project actions"
        className="flex h-full w-14 shrink-0 flex-col items-center gap-2 bg-muted/30 py-3"
      >
        {canOpenInIde && (
          <RailButton
            label={`Open in ${getIdeName(config?.editor?.editor_type)}`}
            onClick={() => openInEditor()}
          >
            <IdeIcon
              editorType={config?.editor?.editor_type}
              className="h-4 w-4"
            />
          </RailButton>
        )}

        <RailButton
          label="Project settings"
          active={isProjectSettingsPath(location.pathname)}
          onClick={() => navigate(buildProjectSettingsPath(projectId))}
        >
          <Settings className="h-4 w-4" />
        </RailButton>

        <RailButton
          label="New task"
          onClick={() => openTaskForm({ mode: 'create', projectId })}
        >
          <Plus className="h-4 w-4" />
        </RailButton>
      </aside>
    </TooltipProvider>
  );
}
