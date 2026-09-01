-- Kablan: a finished task drops out of the views once it has been finished for a while.
--
-- A timestamp rather than a flag: "when" is worth keeping (it is what an Archived view sorts by),
-- and NULL says "not archived" without a second column. Set by the periodic job for tasks that
-- have been done or cancelled long enough, and by hand from the task's own menu; cleared when a
-- task is reopened.
ALTER TABLE tasks ADD COLUMN archived_at TEXT;

-- The list queries all filter on it, and archived rows accumulate forever by design.
CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON tasks (archived_at);
