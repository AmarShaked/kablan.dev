import { NewTaskDialog } from '@/components/dialogs/tasks/NewTaskDialog';
import { TaskFormDialog } from '@/components/dialogs/tasks/TaskFormDialog';
import type { TaskFormDialogProps } from '@/components/dialogs/tasks/TaskFormDialog';

/**
 * New work opens the minimal dialog. Editing an existing task keeps the
 * smaller status form.
 */
export function openTaskForm(props: TaskFormDialogProps) {
  if (props.mode === 'edit') return TaskFormDialog.show(props);
  return NewTaskDialog.show(props);
}
