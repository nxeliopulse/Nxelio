-- Adds the remaining real fields from the "Add New Deals" form redesign.
-- "Pipeline" was deliberately skipped — this app has one single pipeline
-- (opportunities.stage), so a separate Pipeline field would just duplicate
-- Status. "Project" is a simple free-text tag list (like contacts.tags),
-- not a full Projects entity — nothing like that exists elsewhere yet.
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS period TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS period_value NUMERIC;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS tags TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IS NULL OR priority IN ('Low', 'Medium', 'High'));
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS projects TEXT;
