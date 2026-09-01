-- Kablan: saved prompts are gone; tags do the same job with project scope.
--
-- They were two systems for reusable text — one inline by @name, one picked from the composer
-- menu — differing only in scope and gesture. Tags kept the name people already type.
ALTER TABLE projects DROP COLUMN saved_prompts;
