-- External ticket this task was started from (Linear, later Jira / GitHub Issues / Monday).
-- Null while the task was created in Kablan itself.
ALTER TABLE tasks ADD COLUMN source_provider TEXT;
ALTER TABLE tasks ADD COLUMN source_id TEXT;
ALTER TABLE tasks ADD COLUMN source_identifier TEXT;
ALTER TABLE tasks ADD COLUMN source_url TEXT;

-- One Kablan task per remote ticket, so "Start as task" can become "Open task".
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_source
    ON tasks (source_provider, source_id)
    WHERE source_provider IS NOT NULL AND source_id IS NOT NULL;
