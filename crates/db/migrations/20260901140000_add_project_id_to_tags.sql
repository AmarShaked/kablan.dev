-- Kablan: tags belong to a project, or to no project and therefore to all of them.
--
-- Nullable rather than required: every tag that exists predates this column and is global, and
-- a global snippet ("the definition of done", a review checklist) is still worth having. A tag
-- with a project only appears in that project.
ALTER TABLE tags ADD COLUMN project_id BLOB REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tags_project_id ON tags (project_id);
