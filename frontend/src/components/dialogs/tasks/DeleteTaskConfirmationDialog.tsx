import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { tasksApi } from '@/lib/api';
import { invalidateTaskViews } from '@/lib/taskCache';
import type { TaskWithAttemptStatus } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';

export interface DeleteTaskConfirmationDialogProps {
  task: TaskWithAttemptStatus;
  projectId: string;
}

const DeleteTaskConfirmationDialogImpl =
  NiceModal.create<DeleteTaskConfirmationDialogProps>(({ task, projectId }) => {
    const modal = useModal();
    const queryClient = useQueryClient();
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConfirmDelete = async () => {
      setIsDeleting(true);
      setError(null);

      try {
        await tasksApi.delete(task.id);
        // The board hears about this on its stream; the archived listing and the sidebar counts
        // do not, and would keep offering a task that no longer exists.
        invalidateTaskViews(queryClient, projectId ? [projectId] : undefined);
        modal.resolve();
        modal.hide();
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to delete task';
        setError(errorMessage);
      } finally {
        setIsDeleting(false);
      }
    };

    const handleCancelDelete = () => {
      modal.reject();
      modal.hide();
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => !open && handleCancelDelete()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold">"{task.title}"</span>?
            </DialogDescription>
          </DialogHeader>

          <Alert variant="destructive" className="mb-4">
            <strong>Warning:</strong> This action will permanently delete the
            task and cannot be undone.
          </Alert>

          {error && (
            <Alert variant="destructive" className="mb-4">
              {error}
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelDelete}
              disabled={isDeleting}
              autoFocus
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  });

export const DeleteTaskConfirmationDialog = defineModal<
  DeleteTaskConfirmationDialogProps,
  void
>(DeleteTaskConfirmationDialogImpl);
