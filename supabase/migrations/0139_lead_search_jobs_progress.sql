-- ============================================================================
-- Lead search jobs — exhaustive-search + progress-email fields.
--
-- Follow-up to 0137_lead_search_jobs.sql. That first version tied how large a
-- raw search round could get to the workspace's remaining lead *credit*
-- balance — which is a billing limit on how many leads you can IMPORT, not a
-- real constraint on how many candidates a search may examine while looking
-- for enough confirmed emails. That made the job give up (e.g. "8 of 10")
-- long before it had actually exhausted the real candidate pool.
--
-- This adds: a consecutive-dry-round counter (so "give up" means "N rounds in
-- a row at max search size found nobody new," not "hit an arbitrary count"),
-- a timestamp for the last "still working" status email, and a stored
-- human-readable time estimate shown to the requester up front.
-- ============================================================================

ALTER TABLE lead_search_jobs
  ADD COLUMN IF NOT EXISTS dry_rounds INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_progress_email_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS time_estimate TEXT;
