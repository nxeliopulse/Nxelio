-- Tracks whether a finished Verified Leads job's results have actually been
-- imported yet — lets the UI show a "ready to review" indicator (e.g. a glow
-- on the Verified Leads button) only for jobs that are done AND still
-- unactioned, instead of glowing forever after the first import.
ALTER TABLE lead_search_jobs
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
