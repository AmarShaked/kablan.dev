import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

import { tagsApi } from '@/lib/api';
import { ConfirmDialog } from '@/components/dialogs';
import { TagEditDialog } from '@/components/dialogs/tasks/TagEditDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/table';
import type { Tag } from 'shared/types';

/**
 * Create, edit and delete tags.
 *
 * Scoped when a project is given — the list then shows that project's tags alongside the global
 * ones, and anything created here belongs to the project. Unscoped, in the app's own settings,
 * it manages every tag there is.
 */
export function TagManager({ projectId }: { projectId?: string } = {}) {
  const { t } = useTranslation('settings');
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tagsApi.list({ project_id: projectId ?? null });
      setTags(data);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleOpenDialog = useCallback(
    async (tag?: Tag) => {
      try {
        const result = await TagEditDialog.show({
          tag: tag || null,
          projectId,
        });

        if (result === 'saved') {
          await fetchTags();
        }
      } catch (error) {
        // User cancelled - do nothing
      }
    },
    [fetchTags, projectId]
  );

  const handleDelete = useCallback(
    async (tag: Tag) => {
      // The app's own dialog rather than window.confirm: the native one is styled by the
      // browser, cannot be themed, and says "localhost:5310 says" above the question.
      const result = await ConfirmDialog.show({
        title: `Delete @${tag.tag_name}?`,
        message: t('settings.general.tags.manager.deleteConfirm', {
          tagName: tag.tag_name,
        }),
        confirmText: 'Delete',
        variant: 'destructive',
      }).catch(() => 'canceled');
      if (result !== 'confirmed') return;

      try {
        await tagsApi.delete(tag.id);
        await fetchTags();
      } catch (err) {
        console.error('Failed to delete tag:', err);
      }
    },
    [fetchTags, t]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          {t('settings.general.tags.manager.addTag')}
        </Button>
      </div>

      <div className="max-h-[400px] overflow-auto rounded-md border">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="w-[14rem] px-3 py-2 text-xs font-medium text-muted-foreground">
                {t('settings.general.tags.manager.table.tagName')}
              </TableHeaderCell>
              <TableHeaderCell className="px-3 py-2 text-xs font-medium text-muted-foreground">
                {t('settings.general.tags.manager.table.content')}
              </TableHeaderCell>
              <TableHeaderCell className="w-[6rem] px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                {t('settings.general.tags.manager.table.actions')}
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tags.map((tag) => (
              <TableRow key={tag.id}>
                <TableCell className="px-3 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    @{tag.tag_name}
                    {/* Only worth saying inside a project, where the two kinds sit together. */}
                    {projectId && !tag.project_id && (
                      <Badge
                        variant="secondary"
                        className="px-1.5 py-0 text-[10px] font-normal"
                      >
                        global
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="px-3 text-muted-foreground">
                  <div className="max-w-[28rem] truncate" title={tag.content}>
                    {tag.content || '—'}
                  </div>
                </TableCell>
                <TableCell className="px-3">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleOpenDialog(tag)}
                      aria-label={t(
                        'settings.general.tags.manager.actions.editTag'
                      )}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(tag)}
                      aria-label={t(
                        'settings.general.tags.manager.actions.deleteTag'
                      )}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {tags.length === 0 && (
              <TableEmpty colSpan={3}>
                {t('settings.general.tags.manager.noTags')}
              </TableEmpty>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
