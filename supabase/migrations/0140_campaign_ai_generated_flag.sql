-- The "Draft (AI-generated)" approval status was being applied to every new
-- campaign via the column default, including ones built entirely by hand —
-- there was no way to tell the two apart. Split it: approval_status now just
-- tracks the review lifecycle ("Draft"), and a separate boolean flag tracks
-- whether AI generation was actually used, so the UI can show that as its own
-- badge instead of baking it into the approval status string.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS generated_by_ai BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE campaigns
  ALTER COLUMN approval_status SET DEFAULT 'Draft';

-- The old check constraint only allowed 'Draft (AI-generated)', not plain
-- 'Draft' — drop it before renaming existing rows below, since Postgres
-- validates a constraint against ALL existing rows the moment either
-- version of it is active, and neither the old nor new wording alone
-- covers a table mid-rename.
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_approval_status_check;

-- Existing rows stuck at the old default: we can't know in hindsight whether
-- AI was actually used, so leave generated_by_ai false and just normalize the
-- label itself so old manually-built drafts stop being mislabeled going forward.
UPDATE campaigns SET approval_status = 'Draft' WHERE approval_status = 'Draft (AI-generated)';

-- Now that every row already says 'Draft', re-adding the constraint validates cleanly.
ALTER TABLE campaigns ADD CONSTRAINT campaigns_approval_status_check
  CHECK (approval_status IN ('Draft', 'Pending review', 'Approved', 'Live/Distributing', 'Archived'));
