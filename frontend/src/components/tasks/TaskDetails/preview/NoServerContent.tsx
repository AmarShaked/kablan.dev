import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Square,
  SquareTerminal,
  Settings,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Project } from 'shared/types';
import { useProjectRepos } from '@/hooks';

interface NoServerContentProps {
  projectHasDevScript: boolean;
  runningDevServer: boolean;
  isStartingDevServer: boolean;
  startDevServer: () => void;
  stopDevServer: () => void;
  project: Project | undefined;
  hasFailedDevServer?: boolean;
  onFixDevScript?: () => void;
}

export function NoServerContent({
  projectHasDevScript,
  runningDevServer,
  isStartingDevServer,
  startDevServer,
  stopDevServer,
  project,
  hasFailedDevServer,
  onFixDevScript,
}: NoServerContentProps) {
  const { t } = useTranslation('tasks');
  const navigate = useNavigate();
  const { data: projectRepos = [] } = useProjectRepos(project?.id);

  const handleConfigureDevScript = () => {
    if (projectRepos.length === 1) {
      navigate(`/settings/repos?repoId=${projectRepos[0].id}`);
    } else {
      navigate('/settings/repos');
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md mx-auto p-6">
        <div className="flex items-center justify-center">
          <SquareTerminal className="h-8 w-8 text-muted-foreground" />
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              {t('preview.noServer.title')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {projectHasDevScript
                ? t('preview.noServer.startPrompt')
                : t('preview.noServer.setupPrompt')}
            </p>
          </div>

          <div className="flex items-center justify-center gap-2">
            <Button
              variant={runningDevServer ? 'destructive' : 'default'}
              size="sm"
              onClick={() => {
                if (runningDevServer) {
                  stopDevServer();
                } else {
                  startDevServer();
                }
              }}
              disabled={isStartingDevServer || !projectHasDevScript}
              className="gap-1"
            >
              {runningDevServer ? (
                <>
                  <Square className="h-4 w-4" />
                  {t('preview.toolbar.stopDevServer')}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  {t('preview.noServer.startButton')}
                </>
              )}
            </Button>

            {!runningDevServer && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleConfigureDevScript}
                className="gap-1"
              >
                <Settings className="h-3 w-3" />
                {t('preview.noServer.configureButton')}
              </Button>
            )}

            {hasFailedDevServer && onFixDevScript && (
              <Button
                size="sm"
                variant="outline"
                onClick={onFixDevScript}
                className="gap-1"
              >
                <Wrench className="h-4 w-4" />
                {t('preview.noServer.fixScript')}
              </Button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
