import { useMemo } from 'react';
import {
  DiffView,
  DiffModeEnum,
  DiffLineType,
  parseInstance,
} from '@git-diff-view/react';
import { FileClock, FileX } from 'lucide-react';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { getHighLightLanguageFromPath } from '@/utils/extToLanguage';
import { getActualTheme } from '@/utils/theme';
import { FileChangePill } from './FileChangePill';
import '@/styles/diff-style-overrides.css';
import '@/styles/edit-diff-overrides.css';
import { cn } from '@/lib/utils';
import { useExpandable } from '@/stores/useExpandableStore';

type Props = {
  path: string;
  unifiedDiff: string;
  hasLineNumbers: boolean;
  expansionKey: string;
  defaultExpanded?: boolean;
  statusAppearance?: 'default' | 'denied' | 'timed_out';
  forceExpanded?: boolean;
};

/**
 * Process hunks for @git-diff-view/react
 * - Extract additions/deletions for display
 * - Decide whether to hide line numbers based on backend data
 */
function processUnifiedDiff(unifiedDiff: string, hasLineNumbers: boolean) {
  const hideNums = !hasLineNumbers;
  let isValidDiff;

  let additions = 0;
  let deletions = 0;
  try {
    const parsed = parseInstance.parse(unifiedDiff);
    for (const h of parsed.hunks) {
      for (const line of h.lines) {
        if (line.type === DiffLineType.Add) additions++;
        else if (line.type === DiffLineType.Delete) deletions++;
      }
    }
    isValidDiff = parsed.hunks.length > 0;
  } catch (err) {
    console.error('Failed to parse diff hunks:', err);
    isValidDiff = false;
  }

  return {
    hunks: [unifiedDiff],
    hideLineNumbers: hideNums,
    additions,
    deletions,
    isValidDiff,
  };
}

function EditDiffRenderer({
  path,
  unifiedDiff,
  hasLineNumbers,
  expansionKey,
  defaultExpanded = false,
  statusAppearance = 'default',
  forceExpanded = false,
}: Props) {
  const { config } = useUserSystem();
  const [expanded, setExpanded] = useExpandable(expansionKey, defaultExpanded);
  const effectiveExpanded = forceExpanded || expanded;

  const theme = getActualTheme(config?.theme);
  const { hunks, hideLineNumbers, additions, deletions, isValidDiff } = useMemo(
    () => processUnifiedDiff(unifiedDiff, hasLineNumbers),
    [unifiedDiff, hasLineNumbers]
  );

  const hideLineNumbersClass = hideLineNumbers ? ' edit-diff-hide-nums' : '';

  const diffData = useMemo(() => {
    const lang = getHighLightLanguageFromPath(path) || 'plaintext';
    return {
      hunks,
      oldFile: { fileName: path, fileLang: lang },
      newFile: { fileName: path, fileLang: lang },
    };
  }, [hunks, path]);

  if (statusAppearance === 'denied' || statusAppearance === 'timed_out') {
    const Icon = statusAppearance === 'denied' ? FileX : FileClock;
    return (
      <div className="flex items-center gap-1.5 text-secondary-foreground">
        <Icon className="h-3 w-3" />
        <p className="text-sm font-light overflow-x-auto flex-1">{path}</p>
      </div>
    );
  }

  return (
    <div>
      <FileChangePill
        path={path}
        added={additions}
        removed={deletions}
        selected={effectiveExpanded}
        onClick={() => setExpanded()}
      />

      {effectiveExpanded && (
        <div className={cn('mt-2 border', hideLineNumbersClass)}>
          {isValidDiff ? (
            <DiffView
              data={diffData}
              diffViewWrap={false}
              diffViewTheme={theme}
              diffViewHighlight
              diffViewMode={DiffModeEnum.Unified}
              diffViewFontSize={12}
            />
          ) : (
            <pre
              className="px-4 pb-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap"
              style={{ color: 'hsl(var(--muted-foreground) / 0.9)' }}
            >
              {unifiedDiff}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default EditDiffRenderer;
