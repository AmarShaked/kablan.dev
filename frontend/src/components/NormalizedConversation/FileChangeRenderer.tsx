import { type FileChange } from 'shared/types';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { FileClock, FileX } from 'lucide-react';
import { getHighLightLanguageFromPath } from '@/utils/extToLanguage';
import { getActualTheme } from '@/utils/theme';
import EditDiffRenderer from './EditDiffRenderer';
import FileContentView from './FileContentView';
import { FileChangePill } from './FileChangePill';
import '@/styles/diff-style-overrides.css';
import { useExpandable } from '@/stores/useExpandableStore';

type Props = {
  path: string;
  change: FileChange;
  expansionKey: string;
  defaultExpanded?: boolean;
  statusAppearance?: 'default' | 'denied' | 'timed_out';
  forceExpanded?: boolean;
};

function isWrite(
  change: FileChange
): change is Extract<FileChange, { action: 'write'; content: string }> {
  return change?.action === 'write';
}
function isDelete(
  change: FileChange
): change is Extract<FileChange, { action: 'delete' }> {
  return change?.action === 'delete';
}
function isRename(
  change: FileChange
): change is Extract<FileChange, { action: 'rename'; new_path: string }> {
  return change?.action === 'rename';
}
function isEdit(
  change: FileChange
): change is Extract<FileChange, { action: 'edit' }> {
  return change?.action === 'edit';
}

function writeLineCount(content: string): number {
  if (!content) return 0;
  return content.split('\n').length;
}

const FileChangeRenderer = ({
  path,
  change,
  expansionKey,
  defaultExpanded = false,
  statusAppearance = 'default',
  forceExpanded = false,
}: Props) => {
  const { config } = useUserSystem();
  const [expanded, setExpanded] = useExpandable(expansionKey, defaultExpanded);
  const effectiveExpanded = forceExpanded || expanded;

  const theme = getActualTheme(config?.theme);

  if (statusAppearance === 'denied' || statusAppearance === 'timed_out') {
    const Icon = statusAppearance === 'denied' ? FileX : FileClock;
    return (
      <div className="flex items-center gap-1.5 text-secondary-foreground">
        <Icon className="h-3 w-3" />
        <p className="text-sm font-light overflow-x-auto flex-1">{path}</p>
      </div>
    );
  }

  if (isEdit(change)) {
    return (
      <EditDiffRenderer
        path={path}
        unifiedDiff={change.unified_diff}
        hasLineNumbers={change.has_line_numbers}
        expansionKey={expansionKey}
        defaultExpanded={defaultExpanded}
        statusAppearance={statusAppearance}
        forceExpanded={forceExpanded}
      />
    );
  }

  if (isDelete(change)) {
    return <FileChangePill path={path} action="delete" />;
  }

  if (isRename(change)) {
    return (
      <FileChangePill path={path} action="rename" newPath={change.new_path} />
    );
  }

  if (isWrite(change)) {
    return (
      <div>
        <FileChangePill
          path={path}
          action="write"
          added={writeLineCount(change.content)}
          selected={effectiveExpanded}
          onClick={() => setExpanded()}
        />
        {effectiveExpanded && (
          <div className="mt-2">
            <FileContentView
              content={change.content}
              lang={getHighLightLanguageFromPath(path)}
              theme={theme}
            />
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default FileChangeRenderer;
