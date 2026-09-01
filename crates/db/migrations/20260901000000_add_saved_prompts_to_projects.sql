-- Kablan: prompts a person reuses on a project, kept with the project rather than retyped.
--
-- A JSON array of {id, name, text} in one column rather than a table of its own: the list is
-- short, it is always read and written whole from the project's settings form, and nothing else
-- refers to a prompt by id. Nullable, because every existing project has none.
ALTER TABLE projects ADD COLUMN saved_prompts TEXT;
