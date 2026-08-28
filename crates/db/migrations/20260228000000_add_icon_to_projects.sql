-- Kablan: an optional icon per project, so the projects list is scannable at a glance.
-- Nullable, because every existing project has none and the UI falls back to a default glyph.
ALTER TABLE projects ADD COLUMN icon TEXT;
