-- Adds a Title to contact notes, separate from the note body — matches the
-- "Add New Notes" modal redesign (Title + Note + Attachment).
ALTER TABLE contact_notes ADD COLUMN IF NOT EXISTS title TEXT;
